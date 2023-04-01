import ObjectID from "mongodb";
import decodeOpaqueId from "@reactioncommerce/api-utils/decodeOpaqueId.js";
import validateMinQty from "../util/validateMinQty.js";
import selfSubscriptionCheck from "../util/selfSubscriptionCheck.js";
import checkUserWallet from "../util/checkUserWallet.js";
import updateWallet from "../util/updateWallet.js";
import updateSellerWallet from "../util/updateSellerWallet.js";
import updatePlatformWallet from "../util/updatePlatformWallet.js";
import verifyOwnership from "../util/verifyOwnership.js";
import updateAvailableQuantity from "../util/updateAvailableQuantity.js";
import updateTradeUnits from "../util/updateTradeUnits.js";
import updateOwnership from "../util/updateOwnership.js";
import closeTrade from "../util/closeTrade.js";

export default {
  async createTradePrimary(parent, args, context, info) {
    try {
      let {
        productId,
        price,
        area,
        buyerId,
        sellerId,
        expirationTime,
        tradeType,
        minQty,
        createdBy,
        currencyUnit,
        cancellationReason,
      } = args.input;
      let { authToken, userId, collections } = context;

      let { Transactions, Accounts, Catalog, Products, Trades, Ownership } =
        collections;

      let decodedSellerId = decodeOpaqueId(sellerId).id;
      let decodedProductId = decodeOpaqueId(productId).id;

      if (!authToken || !userId) return new Error("Unauthorized");

      let checkOwnerExist = await Ownership.findOne({
        ownerId: decodeOpaqueId(userId).id,
        productId: decodeOpaqueId(productId).id,
      });

      if (!checkOwnerExist) return new Error("You don't own this property");

      let decodedId = decodeOpaqueId(productId).id;

      const { product } = await Catalog.findOne({
        "product._id": decodedId,
      });

      if (product?.propertySaleType?.type !== "Primary")
        return new Error("Not a primary property");

      if (minQty > area)
        return new Error(
          "Minimum Quantity cannot be greater than the quantity specified"
        );

      let primaryTradeCheck = await Trades.findOne({ productId: product?._id });

      if (!!primaryTradeCheck?._id) {
        throw new Error("A trade already exist for this property");
      }

      let { value } = product.area;

      if (value < area) {
        throw new Error(
          "The amount you specified is greater than the total available for this property"
        );
      }
      let data = {
        sellerId: decodeOpaqueId(sellerId).id,
        price,
        area,
        originalQuantity: area,
        expirationTime,
        tradeType: "offer",
        minQty,
        productId: decodedId,
        approvalStatus: "pending",
        tradeStatus: "inProgress",
        createdBy: decodeOpaqueId(createdBy).id,
      };

      if (product?._id) {
        const { insertedId } = await Trades.insertOne(data);
        if (insertedId) {
          await updateOwnership(
            collections,
            decodedSellerId,
            decodedProductId,
            area
          );
          return { _id: insertedId };
        }
        throw new Error("Error creating Trade");
      }
    } catch (err) {
      console.log(err);
      return err;
    }
  },
  async subscribeToPrimaryProperty(parents, args, context, info) {
    try {
      const { collections } = context;
      let { authToken, userId } = context;
      const { Ownership, Catalog, Accounts, Trades } = collections;

      const {
        productId,
        units,
        ownerId,
        tradeId,
        sellerId,
        price,
        minQty,
        serviceCharge,
      } = args.input;

      if (!authToken || !userId) return new Error("Unauthorized");

      const decodedProductId = decodeOpaqueId(productId).id;
      const decodedTradeId = decodeOpaqueId(tradeId).id;
      const allOwners = await Ownership.find({
        productId: decodedProductId,
      }).toArray();

      // const totalPrice = units * price;
      //1% service charge
      const service = price / 100;

      await checkUserWallet(
        collections,
        decodeOpaqueId(userId).id,
        price + service
      );

      await validateMinQty(collections, decodedTradeId, units);

      const { product } = await Catalog.findOne({
        "product._id": decodedProductId,
      });

      let sum = [];
      if (allOwners.length > 1) {
        sum = await Ownership.aggregate([
          {
            $match: {
              productId: decodedProductId,
              ownerId: { $ne: decodeOpaqueId(sellerId).id },
            },
          },
          { $group: { _id: "$productId", totalUnits: { $sum: "$amount" } } },
        ]).toArray();
      }

      let totalSum = sum[0]?.totalUnits;

      console.log("total sum is ", totalSum);

      if (totalSum === product?.area?.value) {
        console.log("product?.area?.value", product?.area?.value);

        return new Error("This property has been fully subscribed");
      }
      if (totalSum + units > product?.area?.value) {
        return new Error(
          `The total units available for this property are ${
            product?.area?.value - totalSum
          }`
        );
      }

      const filter = {
        ownerId: decodeOpaqueId(userId).id,
        productId: decodedProductId,
      };
      const update = {
        $inc: { amount: units },
        $setOnInsert: {
          productId: decodedProductId,
          tradeId: decodedTradeId,
          ownerId: decodeOpaqueId(userId).id,
        },
      };
      const options = { upsert: true, returnOriginal: false };
      const { lastErrorObject } = await Ownership.findOneAndUpdate(
        filter,
        update,
        options
      );
      let x = price - serviceCharge;
      let FundsToUpdate = (3 / 100) * x;
      let sellerFundsToUpdate = x - FundsToUpdate;
      if (lastErrorObject?.n > 0) {
        const { result } = await Ownership.update(
          { ownerId: decodeOpaqueId(sellerId).id, productId: decodedProductId },
          { $inc: { unitsEscrow: -units } }
        );

        // update buyer funds
        await updateWallet(collections, decodeOpaqueId(userId).id, -price);

        // update seller funds
        await updateWallet(
          collections,
          decodeOpaqueId(sellerId).id,
          sellerFundsToUpdate
        );

        //update admin/platform funds
        await updateWallet(
          collections,
          decodeOpaqueId("640f0192a9967d6d705c9e74").id,
          serviceCharge
        );

        // await updateAvailableQuantity(collections, decodedProductId, -units);
        await updateTradeUnits(collections, decodedTradeId, -units, minQty);
        await closeTrade(collections, decodedTradeId);
        return result?.n > 0;
      }

      return false;
    } catch (err) {
      return err;
    }
  },
  async createTradeForProperty(parent, args, context, info) {
    try {
      let {
        productId,
        price,
        area,
        buyerId,
        sellerId,
        expirationTime,
        tradeType,
        minQty,
        createdBy,
        currencyUnit,
        cancellationReason,
      } = args.input;

      let { auth, authToken, userId, collections } = context;
      let { Transactions, Accounts, Catalog, Products, Trades, Ownership } =
        collections;

      if (!authToken || !userId) return new Error("Unauthorized");

      let ownerRes = await Ownership.findOne({
        ownerId: decodeOpaqueId(userId).id,
        productId: decodeOpaqueId(productId).id,
      });

      if (tradeType === "offer" && !ownerRes)
        return new Error("You don't own this property");

      if (minQty > area)
        return new Error(
          "Minimum Quantity cannot be greater than the quantity specified"
        );
      if (ownerRes?.amount < area) {
        return new Error(`You cannot sell more than ${ownerRes?.amount} units`);
      }
      // if (!units && tradeType === "bid")
      //   return new Error(
      //     "You are not allowed to create bid-offer for this property"
      //   );

      //1% service charge
      const serviceCharge = price / 100;

      if (tradeType === "bid") {
        await checkUserWallet(collections, userId, price + serviceCharge);
      }

      let decodedId = decodeOpaqueId(productId).id;
      const { product } = await Catalog.findOne({
        "product._id": decodedId,
      });

      if (!product) {
        throw new Error("Property not found");
      }

      // console.log("product is ", product);
      // console.log("property sale type is ", product.propertySaleType.type);

      let primaryTradeCheck = Trades.find({ productId: product?._id });

      if (primaryTradeCheck && product?.propertySaleType?.type === "Primary") {
        throw new Error("Cannot create multiple trades for primary property");
      }

      let { value } = product.area;

      if (value < area) {
        throw new Error(
          "The amount you specified is greater than the total available for this property"
        );
      }
      let data = {};
      if (tradeType === "offer") {
        data = {
          sellerId: decodeOpaqueId(sellerId).id,
          price,
          area,
          originalQuantity: area,
          expirationTime,
          tradeType,
          minQty,
          productId: decodedId,
          approvalStatus: "pending",
          createdBy: decodeOpaqueId(createdBy).id,
          completionStatus: "inProgress",
        };
      }
      if (tradeType === "bid") {
        data = {
          buyerId: decodeOpaqueId(buyerId).id,
          price,
          area,
          expirationTime,
          tradeType,
          minQty,
          productId: decodedId,
          approvalStatus: "pending",
          createdBy: decodeOpaqueId(createdBy).id,
          completionStatus: "inProgress",
        };
      }
      if (product?._id) {
        const { insertedId } = await Trades.insertOne(data);
        if (insertedId) {
          if (buyerId) {
            await Accounts.updateOne(
              { _id: decodeOpaqueId(buyerId).id },
              {
                $inc: { "wallets.amount": -price, "wallets.escrow": price },
              }
            );
          } else if (sellerId) {
            await updateOwnership(
              collections,
              decodeOpaqueId(sellerId).id,
              decodeOpaqueId(productId).id,
              area
            );
          }
          return { _id: insertedId };
        }
        throw new Error("Error creating Trade");
      }
    } catch (err) {
      return err;
    }
  },
  async makePrimaryOwner(parent, args, context, info) {
    try {
      let { collections } = context;
      let { Transactions, Accounts, Catalog, Ownership } = collections;

      const { ownerId, productId } = args;
      const { id } = decodeOpaqueId(productId);

      const ownerCheck = await Ownership.findOne({
        productId: id,
      });
      console.log("owner check is ", ownerCheck);
      if (ownerCheck)
        return new Error(
          "You have already assigned an owner for this property"
        );

      const { product, propertySaleType } = await Catalog.findOne({
        "product._id": decodeOpaqueId(productId).id,
      });
      let totalValue = product?.area?.value;
      console.log("property sale type is ", propertySaleType);
      if (propertySaleType?.type !== "Primary")
        return new Error("Not a primary property");

      let data = {
        ownerId: decodeOpaqueId(ownerId).id,
        amount: totalValue,
        unitsEscrow: 0,
        productId: id,
      };

      let ownerToFind = await Accounts.findOne({
        _id: decodeOpaqueId(ownerId).id,
      });

      if (!ownerToFind) return new Error("User does not exist");

      const { result } = await Ownership.insertOne(data);
      if (result) {
        await updateAvailableQuantity(collections, id, -totalValue);
        return true;
      }
      return false;
    } catch (err) {
      console.log("err in make primary owner mutation ", err);
      return err;
    }
  },
  async makeResaleOwner(parent, args, context, info) {
    try {
      let { collections } = context;
      let { Transactions, Accounts, Catalog, Ownership } = collections;

      const { ownerId, productId, units } = args;
      const { id } = decodeOpaqueId(productId);

      const { product, propertySaleType } = await Catalog.findOne({
        "product._id": id,
      });

      // let totalValue = product?.area?.value;
      let remainingValue = product?.area?.availableQuantity;

      console.log("sale type is ", propertySaleType);
      if (propertySaleType?.type !== "Resale")
        return new Error("Not a resale property");

      if (units > remainingValue)
        return new Error(
          `You can only assign ownership for ${remainingValue} remaining Units`
        );

      // let data = {
      //   ownerId: decodeOpaqueId(ownerId).id,
      //   amount: units,
      //   unitsEscrow: 0,
      //   productId: id,
      // };

      let ownerToFind = await Accounts.findOne({
        _id: decodeOpaqueId(ownerId).id,
      });

      if (!ownerToFind) return new Error("User does not exist");
      const filter = {
        ownerId: decodeOpaqueId(ownerId).id,
        productId: decodeOpaqueId(productId).id,
      };
      const update = {
        $inc: { amount: units },
        $setOnInsert: {
          unitsEscrow: 0,
          ownerId: decodeOpaqueId(ownerId).id,
          productId: decodeOpaqueId(productId).id,
        },
      };
      const options = { upsert: true };

      const { lastErrorObject } = await Ownership.findOneAndUpdate(
        filter,
        update,
        options
      );
      console.log("last error object", lastErrorObject);
      if (lastErrorObject?.n > 0) {
        await updateAvailableQuantity(collections, id, -units);
        return true;
      }
      return false;
    } catch (err) {
      console.log("err in make primary owner mutation ", err);
      return err;
    }
  },
  async purchaseUnits(parent, args, context, info) {
    try {
      const { authToken, userId, collections } = context;
      const { Ownership } = collections;
      const {
        sellerId,
        productId,
        tradeId,
        tradeType,
        units,
        price,
        buyerId,
        serviceCharge,
        minQty,
      } = args.input;

      if (!authToken || !userId) return new Error("Unauthorized");

      const decodedBuyerId = decodeOpaqueId(buyerId).id;
      const decodedSellerId = decodeOpaqueId(sellerId).id;
      const decodedProductId = decodeOpaqueId(productId).id;
      const decodedTradeId = decodeOpaqueId(tradeId).id;

      await checkUserWallet(collections, decodedBuyerId, price + serviceCharge);
      await validateMinQty(collections, decodedTradeId, units);

      console.log("validating min quantity");

      const filter = { ownerId: decodedBuyerId, productId: decodedProductId };
      const update = {
        $inc: { amount: units },
        $setOnInsert: {
          productId: decodedProductId,
          tradeId: decodedTradeId,
          ownerId: decodedBuyerId,
        },
        $push: {
          purchaseHistory: price,
          unitsHistory: units,
          tradeHistory: tradeType,
        },
      };

      const options = { upsert: true, returnOriginal: false };

      // Update buyer ownership
      const { lastErrorObject } = await Ownership.findOneAndUpdate(
        filter,
        update,
        options
      );

      // return false;

      if (lastErrorObject?.n > 0) {
        // Update seller ownership
        const { result } = await Ownership.updateOne(
          {
            ownerId: decodedSellerId,
            productId: decodedProductId,
          },
          { $inc: { unitsEscrow: -units } }
        );

        const netPrice = price - serviceCharge;

        // Update buyer, seller, and platform wallets
        await Promise.all([
          updateWallet(collections, decodedBuyerId, -netPrice),

          updateWallet(collections, decodedSellerId, price),
          updateWallet(
            collections,
            decodeOpaqueId("640f0192a9967d6d705c9e74").id,
            serviceCharge
          ),
          updateTradeUnits(collections, decodedTradeId, -units, minQty),
        ]);
        await closeTrade(collections, decodedTradeId);
        return result?.n > 0;
      }

      return false;
    } catch (err) {
      return err;
    }
  },
  async sellUnits(parent, args, context, info) {
    try {
      let { authToken, userId, collections } = context;
      let { Ownership } = collections;
      let {
        sellerId,
        productId,
        tradeId,
        units,
        price,
        buyerId,
        serviceCharge,
        minQty,
      } = args.input;

      if (!authToken || !userId) return new Error("Unauthorized");
      let decodedTradeId = decodeOpaqueId(tradeId).id;
      let decodedBuyerId = decodeOpaqueId(buyerId).id;
      await verifyOwnership(
        collections,
        decodeOpaqueId(sellerId).id,
        decodeOpaqueId(productId).id,
        units
      );
      await validateMinQty(collections, decodeOpaqueId(tradeId).id, units);
      const filter = {
        ownerId: decodeOpaqueId(buyerId).id,
        productId: decodeOpaqueId(productId).id,
      };
      const update = {
        $inc: { amount: units },
        $setOnInsert: {
          productId: decodeOpaqueId(productId).id,
          tradeId: decodeOpaqueId(tradeId).id,
          ownerId: decodeOpaqueId(buyerId).id,
        },
      };
      const options = { upsert: true, returnOriginal: false };
      //update buyer ownership
      const { lastErrorObject } = await Ownership.findOneAndUpdate(
        filter,
        update,
        options
      );
      if (lastErrorObject?.n > 0) {
        //update seller ownership
        const { result } = await Ownership.update(
          {
            ownerId: decodeOpaqueId(sellerId).id,
            productId: decodeOpaqueId(productId).id,
          },
          { $inc: { unitsEscrow: -units } }
        );

        await Promise.all([
          updateWallet(collections, decodedBuyerId, -price),

          updateWallet(collections, decodeOpaqueId(sellerId).id, price),
          updateWallet(
            collections,
            decodeOpaqueId("640f0192a9967d6d705c9e74").id,
            serviceCharge
          ),
          updateTradeUnits(collections, decodedTradeId, -units),
          closeTrade(collections, decodedTradeId),
        ]);
        return result?.n > 0;
      }

      return false;
    } catch (err) {
      return err;
    }
  },
};
