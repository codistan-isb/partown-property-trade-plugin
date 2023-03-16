import ObjectID from "mongodb";
import decodeOpaqueId from "@reactioncommerce/api-utils/decodeOpaqueId.js";
import validateMinQty from "../util/validateMinQty.js";
import selfSubscriptionCheck from "../util/selfSubscriptionCheck.js";
import checkUserWallet from "../util/checkUserWallet.js";

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
        buyerId,
        sellerId,
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
      let { auth, authToken, userId } = context;
      const { Ownership, Catalog, Accounts, Trades } = collections;

      const { productId, units, ownerId, tradeId, sellerId } = args.input;

      if (!authToken || !userId) return new Error("Unauthorized");

      const allOwners = await Ownership.find({
        productId: decodeOpaqueId(productId).id,
      }).toArray();

      await checkUserWallet(collections, decodeOpaqueId(userId).id, units);
      await validateMinQty(collections, decodeOpaqueId(tradeId).id, units);
      await selfSubscriptionCheck(collections, ownerId);

      const { product } = await Catalog.findOne({
        "product._id": decodeOpaqueId(productId).id,
      });
      let sum = [];
      if (allOwners.length > 1) {
        sum = await Ownership.aggregate([
          { $match: { productId: productId } },
          { $group: { _id: "$productId", totalUnits: { $sum: "$amount" } } },
        ]).toArray();
      }

      let totalSum = sum[0]?.totalUnits;
      console.log("total sum is ", totalSum);
      if (totalSum === product?.area?.value)
        return new Error("This property has been fully subscribed");

      if (totalSum + units > product?.area?.value) {
        return new Error(
          `The total units available for this property are ${
            product?.area?.value - totalSum
          }`
        );
      }

      let data = {
        productId,
        amount: units,
        ownerId,
        tradeId,
      };
      const { result } = await Ownership.insertOne(data);
      if (result?.n > 0) {
        const { result } = await Ownership.update(
          { ownerId: decodeOpaqueId(sellerId).id },
          { $inc: { amount: -units } }
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
      console.log("making primary owner");
      const { ownerId, productId } = args;

      const { id } = decodeOpaqueId(productId);
      const { product } = await Catalog.findOne({
        "product._id": decodeOpaqueId(productId).id,
      });
      let totalValue = product?.area?.value;

      let data = {
        ownerId,
        amount: totalValue,
        productId: id,
      };

      let ownerToFind = await Accounts.findOne({ _id: ownerId });

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
      let { auth, authToken, userId, collections } = context;
      let { Transactions, Accounts, Catalog, Trades, Ownership } = collections;

      let { buyerId, units, sellerId, tradeId, tradeType, productId } =
        args.input;
      if (!authToken || !userId) return new Error("Unauthorized");

      let tradeFounded = await Trades.findOne({
        sellerId,
      });

      let { wallets } = await Accounts.findOne({
        _id: decodeOpaqueId(buyerId).id,
      });

      if (wallets?.amount < units)
        return new Error(
          "Insufficient funds in your wallet, please add funds to your wallet first to make this purchase"
        );

      if (!tradeFounded) return new Error("Trade Option does not exist");

      if (tradeType === "bid")
        return new Error("This trade can only be used to sell units");

      let data = {
        ownerId: buyerId,
        sellerId,
        units,
        productId,
        tradeType,
      };

      const res = Ownership.findOne({ ownerId: buyerId, productId: productId });

      const { result } = await Ownership.insertOne(data);
      return result?.n > 0;
    } catch (err) {
      console.log("err in purchase or sell units mutation", err);
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
