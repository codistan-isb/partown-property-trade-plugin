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
import sendTradeCreationEmail from "../util/sendTradeCreationEmail.js";
import validateUser from "../util/validateUser.js";

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

      if (!authToken || !userId) return new Error("Unauthorized");
      // let res = await sendTradeCreationEmail(
      //   context,
      //   "accounts/verifyEmail",
      //   userId
      // );

      let decodedSellerId = decodeOpaqueId(sellerId).id;
      let decodedProductId = decodeOpaqueId(productId).id;

      if (!authToken || !userId) return new Error("Unauthorized");
      await validateUser(context, userId);

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
        isDisabled: false,
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
      const { Ownership, Catalog, Accounts, Trades, ProductRate } = collections;

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
      await validateUser(context, userId);

      const decodedProductId = decodeOpaqueId(productId).id;
      const decodedTradeId = decodeOpaqueId(tradeId).id;
      const allOwners = await Ownership.find({
        productId: decodedProductId,
      }).toArray();

      // const totalPrice = units * price;
      //1% service charge
      let rates = await ProductRate.findOne({ productType: "Primary" });
      console.log("rates are ", rates);
      let buyerFee = 0;
      let sellerFee = 0;
      if (rates?.buyerFee) {
        buyerFee = (rates.buyerFee / 100) * price;
      }
      if (rates?.sellerFee) {
        buyerFee = (rates.sellerFee / 100) * price;
      }

      await checkUserWallet(
        collections,
        decodeOpaqueId(userId).id,
        price + buyerFee
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
        $push: {
          ownershipHistory: {
            price: price,
            quantity: units,
            date: new Date(),
            tradeType: "",
          },
        },
      };
      const options = { upsert: true, returnOriginal: false };
      const { lastErrorObject } = await Ownership.findOneAndUpdate(
        filter,
        update,
        options
      );

      const netBuyerPrice = price + buyerFee;
      const netSellerPrice = price - sellerFee;
      const netServiceCharge = buyerFee + sellerFee;
      if (lastErrorObject?.n > 0) {
        const { result } = await Ownership.update(
          { ownerId: decodeOpaqueId(sellerId).id, productId: decodedProductId },
          { $inc: { unitsEscrow: -units } }
        );

        // update buyer funds
        await updateWallet(
          collections,
          decodeOpaqueId(userId).id,
          -netBuyerPrice
        );

        // update seller funds
        await updateWallet(
          collections,
          decodeOpaqueId(sellerId).id,
          netSellerPrice
        );

        //update admin/platform funds
        await updateWallet(
          collections,
          decodeOpaqueId("640f0192a9967d6d705c9e74").id,
          netServiceCharge
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
      await validateUser(context, userId);

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
          isDisabled: false,
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
      const { Ownership, ProductRate } = collections;
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
      await validateUser(context, userId);

      const decodedBuyerId = decodeOpaqueId(buyerId).id;
      const decodedSellerId = decodeOpaqueId(sellerId).id;
      const decodedProductId = decodeOpaqueId(productId).id;
      const decodedTradeId = decodeOpaqueId(tradeId).id;

      let rates = await ProductRate.findOne({ productType: "Resale" });
      let buyerFee = 0;
      let sellerFee = 0;
      if (rates?.buyerFee) {
        buyerFee = (rates.buyerFee / 100) * price;
      }
      if (rates?.sellerFee) {
        buyerFee = (rates.sellerFee / 100) * price;
      }
      await checkUserWallet(collections, decodedBuyerId, price + buyerFee);
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
          ownershipHistory: {
            price: price,
            quantity: units,
            tradeType: "buy",
            date: new Date(),
          },
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

        const netBuyerPrice = price + buyerFee;
        const netSellerPrice = price - sellerFee;
        const netServiceCharge = buyerFee + sellerFee;

        // Update buyer, seller, and platform wallets
        await Promise.all([
          updateWallet(collections, decodedBuyerId, -netBuyerPrice),

          updateWallet(collections, decodedSellerId, netSellerPrice),
          updateWallet(
            collections,
            decodeOpaqueId("640f0192a9967d6d705c9e74").id,
            netServiceCharge
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
      let { Ownership, ProductRate } = collections;
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
      await validateUser(context, userId);
      let decodedTradeId = decodeOpaqueId(tradeId).id;
      let decodedBuyerId = decodeOpaqueId(buyerId).id;

      let rates = await ProductRate.findOne({ productType: "Resale" });
      let buyerFee = 0;
      let sellerFee = 0;
      if (rates?.buyerFee) {
        buyerFee = (rates.buyerFee / 100) * price;
      }
      if (rates?.sellerFee) {
        buyerFee = (rates.sellerFee / 100) * price;
      }
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
          { $inc: { amount: -units } }
        );
        const netBuyerPrice = price + buyerFee;
        const netSellerPrice = price - sellerFee;
        const netServiceCharge = buyerFee + sellerFee;
        await Promise.all([
          updateWallet(collections, decodedBuyerId, -netBuyerPrice),

          updateWallet(
            collections,
            decodeOpaqueId(sellerId).id,
            netSellerPrice
          ),
          updateWallet(
            collections,
            decodeOpaqueId("640f0192a9967d6d705c9e74").id,
            netServiceCharge
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
  async voteProperty(parent, args, context, info) {
    try {
      let { authToken, userId, collections } = context;
      let { Votes, Catalog } = collections;
      let { productId, voteType } = args.input;

      if (!authToken || !userId) return null;
      let decodedProductId = decodeOpaqueId(productId).id;
      const { propertySaleType } = await Catalog.findOne({
        "product._id": decodedProductId,
      });

      if (propertySaleType?.type !== "Premarket")
        return new Error("Property is not in the pre-market stage");

      const filter = {
        userId,
        productId: decodedProductId,
      };
      const update = {
        $set: { voteType },
        $setOnInsert: {
          productId: decodedProductId,
          userId,
        },
      };
      const options = { upsert: true, returnOriginal: false };
      const { lastErrorObject } = await Votes.findOneAndUpdate(
        filter,
        update,
        options
      );

      return lastErrorObject?.n > 0;
    } catch (err) {
      return err;
    }
  },
  async disableTrade(parent, { tradeId }, context, info) {
    try {
      const { authToken, userId, collections } = context;
      const { Trades } = collections;
      let decodedTradeId = decodeOpaqueId(tradeId).id;
      const trade = Trades.updateOne(
        {
          _id: ObjectID.ObjectId(tradeId),
          createdBy: userId,
        },
        { $set: { isDisabled: true } }
      );
    } catch (err) {
      return err;
    }
  },
  async cancelTrade(parent, { tradeId }, context, info) {
    try {
      const { authToken, userId, collections } = context;
      const { Trades } = collections;
      const { result } = Trades.updateOne(
        {
          _id: ObjectID.ObjectId(tradeId),
          createdBy: userId,
        },
        { $set: { isCancelled: true } }
      );
      return result?.n > 0;
    } catch (err) {
      return err;
    }
  },
  async editTrade(parent, args, context, info) {
    try {
      const { authToken, userId, collections } = context;
      const { Trades } = collections;

      const {
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

      console.log("args are ", args);

      console.log("args input ", args.input);

      let decodedTradeId = decodeOpaqueId(args.tradeId).id;

      let { result } = await Trades.updateOne(
        {
          _id: ObjectID.ObjectId(decodedTradeId),
          createdBy: userId,
        },
        { $set: { price, area, minQty, expirationTime } }
      );
      // console.log("result is ", result);

      return result?.n > 0;
    } catch (err) {
      return err;
    }
  },
};
