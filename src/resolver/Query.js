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
      let { productId } = args;
      let { auth, authToken, userId, collections } = context;
      let { Trades } = collections;

      if (!productId) {
        throw new Error("invalid product");
      }

      if (!authToken || !userId) {
        throw new Error("Unauthorized");
      }
      let decodedId = decodeOpaqueId(productId).id;

      let tradeResults = await Trades.find({ productId: decodedId }).toArray();
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
