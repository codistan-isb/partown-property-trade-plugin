import decodeOpaqueId from "@reactioncommerce/api-utils/decodeOpaqueId.js";
export default {
  async getTrades(parents, args, context, info) {
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
  async getTradesForProperty(parents, args, context, info) {
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
  async getUnitOwnership(parents, args, context, info) {
    try {
      let { productId, ownerId } = args;
      let { authToken, userId, collections } = context;
      let { Ownership } = collections;
      const owner = await Ownership.find({ ownerId }).toArray();
      return owner;
    } catch (err) {
      return err;
    }
  },
};
