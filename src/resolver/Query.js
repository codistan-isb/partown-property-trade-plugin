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
          completionStatus: {
            $ne: "completed",
          },
        }).toArray();
      } else {
        tradeResults = await Trades.find({
          productId: decodedId,
          createdBy: {
            $ne: userId,
          },
          completionStatus: {
            $ne: "completed",
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
  async myTrades(parent, { filter }, context, info) {
    try {
      let { authToken, userId, collections } = context;
      let { Trades } = collections;

      if (!authToken || !userId) return new Error("Unauthorized");
      let matchStage = {};
      if (filter === "completed") {
        matchStage = { completionStatus: "completed" };
      }

      let allTrades = Trades.find({
        createdBy: userId,
        ...matchStage,
      }).toArray();

      return allTrades;
    } catch (err) {
      return err;
    }
  },
  async remainingQuantity(parent, { productId }, context, info) {
    try {
      let { collections, userId, authToken } = context;

      let decodedProductId = decodeOpaqueId(productId).id;

      let { Trades, Catalog } = collections;
      let { product } = await Catalog.findOne({
        "product._id": decodedProductId,
      });
      let sum = [];
      if (!userId || !userId) {
        sum = await Trades.aggregate([
          {
            $match: {
              productId: decodedProductId,
              tradeType: "offer",
            },
          },
          {
            $group: {
              _id: "$productId",
              totalUnits: { $sum: "$area" },
              totalOriginal: { $sum: "$originalQuantity" },
            },
          },
        ]).toArray();
      } else {
        sum = await Trades.aggregate([
          {
            $match: {
              productId: decodedProductId,
              tradeType: "offer",
            },
          },
          {
            $match: {
              sellerId: { $ne: userId },
            },
          },
          {
            $group: {
              _id: "$productId",
              totalUnits: { $sum: "$area" },
              totalOriginal: { $sum: "$originalQuantity" },
            },
          },
        ]).toArray();
      }

      console.log("sum", sum);

      if (sum.length === 0) {
        return 0;
      }

      let percentage = (
        (sum[0]?.totalUnits / sum[0]?.totalOriginal) *
        100
      ).toFixed(2);

      console.log("percentage is ", percentage);
      return percentage;
    } catch (err) {
      console.log("resale property quantity query");
      return err;
    }
  },
  async propertyVotes(parent, { productId }, context, info) {
    try {
      let { Votes } = context.collections;
      let decodedProductId = decodeOpaqueId(productId).id;
      let result = await Votes.aggregate([
        { $match: { productId: decodedProductId } },
        {
          $group: {
            _id: "$voteType",
            count: { $sum: 1 },
          },
        },
      ]).toArray();
      const upVotesCount =
        result.find((item) => item._id === "UPVOTE")?.count || 0;
      const downVotesCount =
        result.find((item) => item._id === "DOWNVOTE")?.count || 0;

      return { upVotesCount, downVotesCount };
    } catch (err) {
      return err;
    }
  },
};
