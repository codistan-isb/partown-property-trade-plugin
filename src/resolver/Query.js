import decodeOpaqueId from "@reactioncommerce/api-utils/decodeOpaqueId.js";
export default {
  async getTrades(parent, args, context, info) {
    try {
      let { Trades } = context.collections;
      let { byUser } = args.input;
      let tradeResults = [];

      let filter = { createdBy: byUser };

      tradeResults = await Trades.find(byUser ? filter : {}).toArray();
      console.log(tradeResults);
      return tradeResults;
    } catch (err) {
      console.log("get trades error ", err);
    }
  },
  async getTradesForProperty(parent, args, context, info) {
    try {
      let { productId, type } = args;
      let { auth, authToken, userId, collections } = context;
      let { Trades } = collections;

      if (!productId) {
        throw new Error("invalid product");
      }

      if (!authToken || !userId) {
        throw new Error("Unauthorized");
      }
      let decodedId = decodeOpaqueId(productId).id;
      console.log("user id", userId);

      let tradeResults = [];
      if (type) {
        tradeResults = await Trades.find({
          productId: decodedId,
          tradeType: type,
          createdBy: {
            $ne: userId,
          },
        }).toArray();
      } else {
        tradeResults = await Trades.find({
          productId: decodedId,
          createdBy: {
            $ne: userId,
          },
        }).toArray();
      }

      return tradeResults;
    } catch (err) {
      console.log("get trades error ", err);
      return err;
    }
  },
  async getUnitOwnership(parent, args, context, info) {
    try {
      let { authToken, userId, collections } = context;
      let { Ownership } = collections;
      let { productId, ownerId } = args;
      let data = {
        productId: decodeOpaqueId(productId).id,
        ownerId: decodeOpaqueId(ownerId).id,
      };
      if (!authToken || !userId) return new Error("Unauthorized");
      const owner = await Ownership.findOne(data);
      if (!owner) return new Error("Owner not found");
      console.log("owner is ", owner);
      return owner;
    } catch (err) {
      return err;
    }
  },
  async getUserProperties(parent, args, context, info) {
    try {
      let { authToken, userId, collections } = context;
      let { Ownership } = collections;
      if (!authToken || !userId) return new Error("Unauthorized");

      let ownerProperties = Ownership.find({
        ownerId: decodeOpaqueId(userId).id,
      }).toArray();
      return ownerProperties;
    } catch (err) {
      return err;
    }
  },
};
