import decodeOpaqueId from "@reactioncommerce/api-utils/decodeOpaqueId.js";
import getPaginatedResponse from "@reactioncommerce/api-utils/graphql/getPaginatedResponse.js";
import wasFieldRequested from "@reactioncommerce/api-utils/graphql/wasFieldRequested.js";
import ReactionError from "@reactioncommerce/reaction-error";
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
      let { Trades, Catalog } = collections;

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
          $and: [
            { productId: decodedId },
            {
              productId: {
                $in: await Catalog.distinct("product._id", {
                  "product.isVisible": { $ne: false },
                }),
              },
            },
            { tradeType: type },
            { isDisabled: false },
            { createdBy: { $ne: userId } },
            { completionStatus: { $ne: "completed" } },
            { isDisabled: { $ne: true } },
            { isCancelled: { $ne: true } },
            { expirationTime: { $gt: new Date() } },
            { area: { $ne: 0 } },
          ],
        }).toArray();
      } else {
        tradeResults = await Trades.find({
          $and: [
            { productId: decodedId },
            {
              productId: {
                $in: await Catalog.distinct("product._id", {
                  "product.isVisible": { $ne: false },
                }),
              },
            },
            { isDisabled: false },
            { createdBy: { $ne: userId } },
            { completionStatus: { $ne: "completed" } },
            { isDisabled: { $ne: true } },
            { isCancelled: { $ne: true } },
            { expirationTime: { $gt: new Date() } },
            { area: { $ne: 0 } },
          ],
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
    {
      accountId,
      searchQuery,
      propertySaleType,
      propertyType,
      location,
      ...connectionArgs
    },
    context,
    info
  ) {
    try {
      let { authToken, userId, collections } = context;
      let { Ownership, Catalog } = collections;
      if (!authToken || !userId) return new Error("Unauthorized");

      let idToUse = userId;

      if (accountId) {
        idToUse = accountId;
      }

      const ownerId = decodeOpaqueId(idToUse).id;
      let filter = [];
      // Add the initial condition for ownerId
      filter.push({ ownerId });

      // Check if searchQuery is provided
      if (searchQuery) {
        // Add the condition for searchQuery
        filter.push({
          productId: {
            $in: await collections.Catalog.distinct("product._id", {
              $or: [
                {
                  "product.title": {
                    $regex: new RegExp(searchQuery, "i"),
                  },
                },
                {
                  "product.slug": {
                    $regex: new RegExp(searchQuery, "i"),
                  },
                },
                {
                  "product.location.country": {
                    $regex: new RegExp(searchQuery, "i"),
                  },
                },
                {
                  "product.location.state": {
                    $regex: new RegExp(searchQuery, "i"),
                  },
                },
                {
                  "product.location.location": {
                    $regex: new RegExp(searchQuery, "i"),
                  },
                },
                {
                  "product.propertyType": {
                    $regex: new RegExp(searchQuery, "i"),
                  },
                },
              ],
            }),
          },
        });
      }

      if (location?.length) {
        filter.push({
          productId: {
            $in: await Catalog.distinct("product._id", {
              "product.location.state": { $in: location },
            }),
          },
        });
      }

      //Add property sale type to condition
      if (propertySaleType) {
        filter.push({
          productId: {
            $in: await Catalog.distinct("product._id", {
              "product.propertySaleType.type": propertySaleType,
            }),
          },
        });
      }

      //Add property type to condition
      if (propertyType?.length) {
        filter.push({
          productId: {
            $in: await Catalog.distinct("product._id", {
              "product.propertyType": { $in: propertyType },
            }),
          },
        });
      }

      // Add the condition for product.isVisible
      filter.push({
        productId: {
          $in: await Catalog.distinct("product._id", {
            "product.isVisible": { $ne: false },
          }),
        },
      });
      console.log("filter is ", filter);

      let ownerProperties = Ownership.find({ $and: filter });

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
    {
      filter,
      searchQuery,
      propertySaleType,
      propertyType,
      location,
      ...connectionArgs
    },
    context,
    info
  ) {
    try {
      let { authToken, userId, collections } = context;
      let { Trades, Catalog, Products } = collections;

      console.log("user id is", userId);
      if (!authToken || !userId) return new Error("Unauthorized");

      let matchStage = [];

      matchStage.push({ createdBy: userId });
      matchStage.push({ isDisabled: { $ne: true } });
      matchStage.push({ isCancelled: { $ne: true } });

      if (filter) {
        matchStage.push({ completionStatus: filter });
      }

      matchStage.push({
        productId: {
          $in: await Catalog.distinct("product._id", {
            "product.isVisible": { $ne: false },
          }),
        },
      });

      if (searchQuery) {
        // Add the condition for searchQuery
        matchStage.push({
          productId: {
            $in: await collections.Catalog.distinct("product._id", {
              $or: [
                {
                  "product.title": {
                    $regex: new RegExp(searchQuery, "i"),
                  },
                },
                {
                  "product.slug": {
                    $regex: new RegExp(searchQuery, "i"),
                  },
                },
                {
                  "product.location.country": {
                    $regex: new RegExp(searchQuery, "i"),
                  },
                },
                {
                  "product.location.state": {
                    $regex: new RegExp(searchQuery, "i"),
                  },
                },
                {
                  "product.location.location": {
                    $regex: new RegExp(searchQuery, "i"),
                  },
                },
                {
                  "product.propertyType": {
                    $regex: new RegExp(searchQuery, "i"),
                  },
                },
              ],
            }),
          },
        });
      }

      if (location?.length) {
        matchStage.push({
          productId: {
            $in: await Catalog.distinct("product._id", {
              "product.location.state": { $in: location },
            }),
          },
        });
      }

      // filters for property sale type

      if (propertySaleType) {
        matchStage.push({
          productId: {
            $in: await Catalog.distinct("product._id", {
              "product.propertySaleType.type": propertySaleType,
            }),
          },
        });
      }

      //Add property type to condition
      if (propertyType?.length) {
        matchStage.push({
          productId: {
            $in: await Catalog.distinct("product._id", {
              "product.propertyType": { $in: propertyType },
            }),
          },
        });
      }

      console.log("match stage is  is ", matchStage);

      let allTrades = Trades.find({ $and: matchStage });

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

  async userNotifications(parent, args, context, info) {
    try {
      const { authToken, userId, collections } = context;
      const { Notifications } = collections;

      console.log("user id ", userId);
      const { ...connectionArgs } = args;

      let allNotifications = Notifications.find({
        to: userId,
        isCleared: { $ne: true },
      });

      return getPaginatedResponse(allNotifications, connectionArgs, {
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

  async propertyOwners(parent, args, context, info) {
    try {
      const { authToken, userId, collections } = context;
      const { Ownership } = collections;
      const { productId, searchQuery, shopId, ...connectionArgs } = args;
      const decodedShopId = decodeOpaqueId(shopId).id;
      console.log("auth Token is ", { authToken, userId });
      if (!userId || !authToken)
        throw new ReactionError("access-denied", "Access Denied");

      // let selector = {};
      await context.validatePermissions("reaction:legacy:products", "read", {
        shopId: decodeOpaqueId(shopId).id,
      });

      const decodedProductId = decodeOpaqueId(productId).id;

      let propertyOwners = Ownership.find({ productId: decodedProductId });
      return getPaginatedResponse(propertyOwners, connectionArgs, {
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

  async userDocuments(parent, args, context, info) {
    try {
      const { authToken, userId, collections } = context;
      const { UserDocuments } = collections;
      const { accountId, searchQuery, ...connectionArgs } = args;
      if (!authToken || !userId) return new Error("Unauthorized");

      let idToUse = userId;
      console.log("id to use is", idToUse);

      if (accountId) {
        await context.validatePermissions("reaction:legacy:accounts", "read");
        idToUse = decodeOpaqueId(accountId).id;
      }

      let selector = {
        accountId: idToUse,
      };

      if (searchQuery) {
        selector.$or = [
          {
            name: {
              $regex: new RegExp(searchQuery, "i"),
            },
          },
        ];
      }

      let documents = UserDocuments.find(selector);

      return getPaginatedResponse(documents, connectionArgs, {
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
};
