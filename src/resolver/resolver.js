import ObjectID from "mongodb";
import decodeOpaqueId from "@reactioncommerce/api-utils/decodeOpaqueId.js";

export default {
  Mutation: {
    async createTradeForProperty(parent, args, context, info) {
      try {
        let {
          tradeBy,
          tradeFor,
          productId,
          price,
          area,
          expirationTime,
          tradeType,
          decorum,
          minQty,
          currencyUnit,
          approvalStatus,
          cancellationReason,
        } = args.input;
        let { Transactions, Accounts, Catalog, Products, Trades } =
          context.collections;

        console.log("product id is ");
        console.log(decodeOpaqueId(productId));

        let { auth, authToken, userId } = context;

        if (!authToken || !userId) {
          throw new Error("Unauthorized");
        }

        // console.log("collections are ");
        // console.log(Catalog);

        let decodedId = decodeOpaqueId(productId).id;
        let productForTrade = await Catalog.findOne({
          _id: decodedId,
        });

        if (!productForTrade) {
          throw new Error("Invalid Property");
        }

        let totalAvailableArea = productForTrade?.product?.area?.value;
        if (totalAvailableArea < area) {
          console.log("reaching this condition");
          throw new Error(
            "The value provided for the units exceeds the total available units for the property "
          );
        }
        let data = {
          tradeBy,
          tradeFor,
          price,
          area,
          expirationTime,
          tradeType,
          minQty,
          productId: decodedId,

          approvalStatus: "pending",
        };
        console.log("product for trade is ");
        console.log(productForTrade);
        if (productForTrade?.product?._id) {
          let trade = await Trades.insertOne(data);
          if (trade?.result?.n > 0) {
            return { _id: trade?.insertedId };
          }
          return trade;
        }
      } catch (err) {
        return err;
      }
    },
  },
  Query: {
    async getTrades(parents, args, context, info) {
      try {
        let { Trades } = context.collections;
        let { byUser } = args.input;
        let tradeResults = [];

        let filter = { tradeBy: byUser };
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
        let decodedId = decodeOpaqueId(productId);
        let tradeResults = await Trades.find().toArray();
        return tradeResults;
      } catch (err) {
        console.log("get trades error ", err);
        return err;
      }
    },
  },
};
