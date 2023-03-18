import ObjectID from "mongodb";
import decodeOpaqueId from "@reactioncommerce/api-utils/decodeOpaqueId.js";
import validateMinQty from "../util/validateMinQty.js";
import selfSubscriptionCheck from "../util/selfSubscriptionCheck.js";
import checkUserWallet from "../util/checkUserWallet.js";
import updateBuyerWallet from "../util/updateBuyerWallet.js";
import updateSellerWallet from "../util/updateSellerWallet.js";
import updatePlatformWallet from "../util/updatePlatformWallet.js";
import verifyOwnership from "../util/verifyOwnership.js";

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
        currencyUnit,
        cancellationReason,
      } = args.input;
      let { Transactions, Accounts, Catalog, Products, Trades, Ownership } =
        context.collections;

      let { auth, authToken, userId } = context;

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
        expirationTime,
        tradeType: "bid",
        minQty,
        productId: decodedId,
        approvalStatus: "pending",
      };

      if (product?._id) {
        const { insertedId } = await Trades.insertOne(data);
        if (insertedId) {
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

      const allOwners = await Ownership.find({
        productId: decodeOpaqueId(productId).id,
      }).toArray();

      await checkUserWallet(collections, decodeOpaqueId(userId).id, units);
      await validateMinQty(collections, decodeOpaqueId(tradeId).id, units);

      const { product } = await Catalog.findOne({
        "product._id": decodeOpaqueId(productId).id,
      });

      console.log("product founded is ", product);

      let sum = [];
      if (allOwners.length > 1) {
        sum = await Ownership.aggregate([
          {
            $match: {
              productId: decodeOpaqueId(productId).id,
              ownerId: { $ne: decodeOpaqueId(sellerId).id },
            },
          },
          { $group: { _id: "$productId", totalUnits: { $sum: "$amount" } } },
        ]).toArray();
      }

      let totalSum = sum[0]?.totalUnits;

      console.log("total sum is ", totalSum);

      if (totalSum === product?.area?.value || totalSum < minQty) {
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

      const filter = { ownerId: decodeOpaqueId(userId).id };
      const update = {
        $inc: { amount: units },
        $setOnInsert: {
          productId: decodeOpaqueId(productId).id,
          tradeId: decodeOpaqueId(tradeId).id,
          ownerId: decodeOpaqueId(userId).id,
        },
      };
      const options = { upsert: true, returnOriginal: false };
      const { lastErrorObject } = await Ownership.findOneAndUpdate(
        filter,
        update,
        options
      );

      if (lastErrorObject?.n > 0) {
        const { result } = await Ownership.update(
          { ownerId: decodeOpaqueId(sellerId).id },
          { $inc: { amount: -units } }
        );
        await updateBuyerWallet(collections, decodeOpaqueId(userId).id, price);
        await updateSellerWallet(
          collections,
          decodeOpaqueId(sellerId).id,
          price - serviceCharge
        );
        await updatePlatformWallet(
          collections,
          decodeOpaqueId("640f0192a9967d6d705c9e74").id,
          serviceCharge
        );

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
      let { Transactions, Accounts, Catalog, Products, Trades, Ownership } =
        context.collections;

      let { auth, authToken, userId } = context;

      if (!authToken || !userId) return new Error("Unauthorized");

      console.log("buyer id is ", buyerId);

      let ownerRes = await Ownership.findOne({
        ownerId: decodeOpaqueId(userId).id,
        productId: decodeOpaqueId(productId).id,
      });

      if (tradeType === "offer" && !ownerRes)
        return new Error("You don't own this property");

      // if (!units && tradeType === "bid")
      //   return new Error(
      //     "You are not allowed to create bid-offer for this property"
      //   );

      let decodedId = decodeOpaqueId(productId).id;
      const { product } = await Catalog.findOne({
        "product._id": decodedId,
      });

      if (!product) {
        throw new Error("Property not found");
      }

      // console.log("product is ", product);
      // console.log("property sale type is ", product.propertySaleType.type);

      // let primaryTradeCheck = Trades.find({ productId: product?._id });

      // if (primaryTradeCheck && product?.propertySaleType?.type === "Primary") {
      //   throw new Error("Cannot create multiple trades for primary property");
      // }

      let { value } = product.area;

      if (value < area) {
        throw new Error(
          "The amount you specified is greater than the total available for this property"
        );
      }
      let data = {
        buyerId,
        sellerId,
        price,
        area,
        expirationTime,
        tradeType,
        minQty,
        productId: decodedId,
        approvalStatus: "pending",
        createdBy: decodeOpaqueId(createdBy).id,
        buyerId: decodeOpaqueId(buyerId).id,
      };

      if (product?._id) {
        const { insertedId } = await Trades.insertOne(data);
        if (insertedId) {
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
      let { Transactions, Accounts, Catalog, Ownership } = context.collections;

      const { ownerId, productId } = args;
      const { id } = decodeOpaqueId(productId);
      const { product } = await Catalog.findOne({
        "product._id": decodeOpaqueId(productId).id,
      });
      let totalValue = product?.area?.value;

      let data = {
        ownerId: decodeOpaqueId(ownerId).id,
        amount: totalValue,
        productId: id,
      };

      let ownerToFind = await Accounts.findOne({
        _id: decodeOpaqueId(ownerId).id,
      });

      if (!ownerToFind) return new Error("User does not exist");

      const { result } = await Ownership.insertOne(data);
      if (result) {
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

      await checkUserWallet(collections, decodeOpaqueId(userId).id, units);
      await validateMinQty(collections, decodeOpaqueId(tradeId).id, units);

      const filter = { ownerId: decodeOpaqueId(buyerId).id };
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
          { ownerId: decodeOpaqueId(sellerId).id },
          { $inc: { amount: -units } }
        );
        await updateBuyerWallet(
          collections,
          decodeOpaqueId(buyerId).id,
          price - serviceCharge
        );
        await updateSellerWallet(collections, sellerId, -price);
        await updatePlatformWallet(
          collections,
          decodeOpaqueId("640f0192a9967d6d705c9e74").id,
          serviceCharge
        );
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

      await verifyOwnership(
        collections,
        decodeOpaqueId(sellerId).id,
        decodeOpaqueId(productId).id,
        units
      );
      await validateMinQty(collections, decodeOpaqueId(tradeId).id, units);
      const filter = { ownerId: decodeOpaqueId(buyerId).id };
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
          { ownerId: decodeOpaqueId(sellerId).id },
          { $inc: { amount: -units } }
        );
        await updateBuyerWallet(
          collections,
          decodeOpaqueId(buyerId).id,
          price - serviceCharge
        );
        await updateSellerWallet(collections, sellerId, -price);
        await updatePlatformWallet(
          collections,
          decodeOpaqueId("640f0192a9967d6d705c9e74").id,
          serviceCharge
        );
        return result?.n > 0;
      }

      return false;
    } catch (err) {
      return err;
    }
  },
  async updateOwnerShip(parent, args, context, info) {
    try {
      const { ownerId, productId, units, buyerId } = args;
      const { Ownership } = context.collections;
      const sellerUpdate = await Ownership.update(
        { productId, ownerId },
        { $inc: { units: units } }
      );
      console.log("seller update is ", sellerUpdate);
      return sellerUpdate?.result?.n > 0;
    } catch (err) {
      return err;
    }
  },
};
