import decodeOpaqueId from "@reactioncommerce/api-utils/decodeOpaqueId.js";
import getPaginatedResponse from "@reactioncommerce/api-utils/graphql/getPaginatedResponse.js";
import wasFieldRequested from "@reactioncommerce/api-utils/graphql/wasFieldRequested.js";
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

      console.log("user id is", userId);
      let decodedId = decodeOpaqueId(productId).id;

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
          isDisabled: { $ne: true },
        }).toArray();
      } else {
        tradeResults = await Trades.find({
          productId: decodedId,
          isDisabled: false,
          createdBy: {
            $ne: userId,
          },
          completionStatus: {
            $ne: "completed",
          },
          isDisabled: { $ne: true },
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

      if (!authToken || !userId) return new Error("Unauthorized");

      let data = {
        productId: decodeOpaqueId(productId).id,
        ownerId: userId,
      };

      const owner = await Ownership.findOne(data);

      console.log("owner is ", owner);
      if (!owner) return new Error("Owner not found");

      return owner;
    } catch (err) {
      return err;
    }
  },
  async getUserProperties(
    parent,
    { accountId, searchQuery, ...connectionArgs },
    context,
    info
  ) {
    try {
      let { authToken, userId, collections } = context;
      let { Ownership } = collections;
      if (!authToken || !userId) return new Error("Unauthorized");

      let idToUse = userId;

      if (accountId) {
        idToUse = accountId;
      }

      let filter = {
        ownerId: decodeOpaqueId(idToUse).id,
      };

      if (searchQuery) {
        filter.productId = {
          $in: await collections.Catalog.distinct("product._id", {
            "product.title": { $regex: searchQuery, $options: "i" },
          }),
        };
      }

      let ownerProperties = Ownership.find(filter);

      return getPaginatedResponse(ownerProperties, connectionArgs, {
        includeHasNextPage: wasFieldRequested("pageInfo.hasNextPage", info),
        includeHasPreviousPage: wasFieldRequested(
          "pageInfo.hasPreviousPage",
          info
        ),
        includeTotalCount: wasFieldRequested("totalCount", info),
      });
    } catch (err) {
      return err;
    }
  },
  async myTrades(
    parent,
    { filter, searchQuery, ...connectionArgs },
    context,
    info
  ) {
    try {
      let { authToken, userId, collections } = context;
      let { Trades } = collections;

      console.log("user id is", userId);
      if (!authToken || !userId) return new Error("Unauthorized");

      let matchStage = {
        createdBy: userId,
        isDisabled: { $ne: true },
        isCancelled: { $ne: true },
      };

      if (filter === "completed") {
        matchStage.completionStatus = "completed";
      }

      if (searchQuery) {
        matchStage.productId = {
          $in: await collections.Catalog.distinct("product._id", {
            "product.title": { $regex: searchQuery, $options: "i" },
          }),
        };
      }

      let allTrades = Trades.find(matchStage);

      console.log("my trades using match stage", allTrades);

      return getPaginatedResponse(allTrades, connectionArgs, {
        includeHasNextPage: wasFieldRequested("pageInfo.hasNextPage", info),
        includeHasPreviousPage: wasFieldRequested(
          "pageInfo.hasPreviousPage",
          info
        ),
        includeTotalCount: wasFieldRequested("totalCount", info),
      });
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
