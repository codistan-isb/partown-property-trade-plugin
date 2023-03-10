// import ObjectID from "mongodb";
// import decodeOpaqueId from "@reactioncommerce/api-utils/decodeOpaqueId.js";

// export default {
//   Mutation: {
//     async createTradePrimary(parent, args, context, info) {
//       try {
//         let {
//           productId,
//           price,
//           area,
//           buyerId,
//           sellerId,
//           expirationTime,
//           tradeType,
//           minQty,
//           currencyUnit,
//           cancellationReason,
//         } = args.input;
//         let { Transactions, Accounts, Catalog, Products, Trades, Ownership } =
//           context.collections;

//         let { auth, authToken, userId } = context;

//         if (!authToken || !userId) return new Error("Unauthorized");

//         let { amount } = await Ownership.findOne({
//           ownerId: userId,
//           productId,
//         });

//         if (amount < price) {
//           return new Error("Bid is greater than total available units");
//         }

//         let decodedId = decodeOpaqueId(productId).id;
//         const { product } = await Catalog.findOne({
//           _id: decodedId,
//         });

//         if (!product) {
//           throw new Error("Property not found");
//         }

//         let primaryTradeCheck = Trades.find({ productId: product?._id });

//         if (
//           primaryTradeCheck &&
//           product?.propertySaleType?.type === "Primary"
//         ) {
//           throw new Error("Cannot create multiple trades for primary property");
//         }

//         let { value } = product.area;

//         if (value < area) {
//           throw new Error(
//             "The amount you specified is greater than the total available for this property"
//           );
//         }
//         let data = {
//           buyerId,
//           sellerId,
//           price,
//           area,
//           expirationTime,
//           tradeType,
//           minQty,
//           productId: decodedId,
//           approvalStatus: "pending",
//         };

//         if (product?._id) {
//           const { insertedId } = await Trades.insertOne(data);
//           if (insertedId) {
//             return { _id: insertedId };
//           }
//           throw new Error("Error creating Trade");
//         }
//       } catch (err) {
//         return err;
//       }
//     },
//     async subscribeToPrimaryProperty(parents, args, context, info) {
//       try {
//         console.log("subscribe to primary property");
//         const { collections } = context;
//         let { auth, authToken, userId } = context;
//         const { Ownership, Catalog, Accounts } = collections;

//         const { productId, units, ownerId } = args.input;

//         const { product } = await Catalog.findOne({ _id: productId });
//         console.log({ authToken, userId });
//         if (!authToken || !userId) return new Error("Unauthorized");

//         let sum = await Ownership.aggregate([
//           { $match: { productId: productId } },
//           { $group: { _id: "$productId", totalUnits: { $sum: "$units" } } },
//         ]).toArray();

//         console.log("total sum is ", sum[0].totalUnits);
//         console.log("remaining value is ", product?.area?.value);

//         let totalSum = sum[0].totalUnits;

//         if (totalSum === product?.area?.value)
//           return new Error("No available subscriptions for this property");

//         if (totalSum + units > product?.area?.value) {
//           console.log("fulfilling condition");
//           return new Error(
//             `The total units available for this property are ${
//               product?.area?.value - totalSum
//             }`
//           );
//         }

//         let { wallets } = await Accounts.findOne({ _id: userId });

//         if (wallets.amount < units) return new Error("Insufficient Funds");

//         const { result } = await Ownership.insertOne(args?.input);

//         return result?.n > 0;
//       } catch (err) {
//         return err;
//       }
//     },
//     async createTradeForProperty(parent, args, context, info) {
//       try {
//         let {
//           productId,
//           price,
//           area,
//           buyerId,
//           sellerId,
//           expirationTime,
//           tradeType,
//           minQty,
//           currencyUnit,
//           cancellationReason,
//         } = args.input;
//         let { Transactions, Accounts, Catalog, Products, Trades, Ownership } =
//           context.collections;

//         let { auth, authToken, userId } = context;

//         if (!authToken || !userId) return new Error("Unauthorized");
//         console.log("userId is ", userId);
//         let { amount } = await Ownership.findOne({
//           ownerId: userId,
//           propertyId: productId,
//         });

//         if (!amount && tradeType === "bid")
//           return new Error(
//             "You are not allowed to create bid-offer for this property"
//           );

//         let decodedId = decodeOpaqueId(productId).id;
//         const { product } = await Catalog.findOne({
//           _id: decodedId,
//         });

//         if (!product) {
//           throw new Error("Property not found");
//         }

//         console.log("product is ", product);
//         console.log("property sale type is ", product.propertySaleType.type);

//         let primaryTradeCheck = Trades.find({ productId: product?._id });

//         if (
//           primaryTradeCheck &&
//           product?.propertySaleType?.type === "Primary"
//         ) {
//           throw new Error("Cannot create multiple trades for primary property");
//         }

//         let { value } = product.area;

//         if (value < area) {
//           throw new Error(
//             "The amount you specified is greater than the total available for this property"
//           );
//         }
//         let data = {
//           buyerId,
//           sellerId,
//           price,
//           area,
//           expirationTime,
//           tradeType,
//           minQty,
//           productId: decodedId,
//           approvalStatus: "pending",
//         };

//         if (product?._id) {
//           const { insertedId } = await Trades.insertOne(data);
//           if (insertedId) {
//             return { _id: insertedId };
//           }
//           throw new Error("Error creating Trade");
//         }
//       } catch (err) {
//         return err;
//       }
//     },
//     async makePrimaryOwner(parent, args, context, info) {
//       try {
//         let { Transactions, Accounts, Catalog, Ownership } =
//           context.collections;
//         console.log("making primary owner");
//         const { ownerId, productId } = args;

//         const { product } = await Catalog.findOne({ _id: productId });
//         let totalValue = product?.area?.value;

//         let data = {
//           ownerId,
//           amount: totalValue,
//           propertyId: productId,
//         };

//         let ownerToFind = await Accounts.findOne({ _id: ownerId });
//         if (!ownerToFind)
//           return new Error(
//             "The user you are trying to make owner of the property, does not exist"
//           );

//         const { result } = await Ownership.insertOne(data);
//         if (result) {
//           return true;
//         }
//         return false;
//       } catch (err) {
//         console.log("err in make primary owner mutation ", err);
//         return err;
//       }
//     },
//     async purchaseUnits(parent, args, context, info) {
//       try {
//         let { auth, authToken, userId, collections } = context;
//         let { Transactions, Accounts, Catalog, Trades, Ownership } =
//           collections;

//         let { buyerId, amount, sellerId, tradeId, tradeType, propertyId } =
//           args.input;

//         // if (!authToken || !userId) return new Error("Unauthorized");

//         let tradeFounded = await Trades.findOne({
//           sellerId,
//         });
//         console.log("trade founded is ", tradeFounded);

//         let { wallets } = await Accounts.findOne({ _id: buyerId });

//         if (wallets?.amount < amount)
//           return new Error(
//             "insufficient funds in your wallet, please add funds to your wallet first to make this purchase"
//           );

//         if (!tradeFounded) return new Error("Trade Option does not exist");

//         if (tradeType === "bid")
//           return new Error("This trade can only be used to sell units");
//         let data = {
//           ownerId: buyerId,
//           sellerId,
//           amount,
//           propertyId,
//           tradeType,
//         };
//         const { result } = await Ownership.insertOne(data);

//         // if (result?.n > 0) return true;
//       } catch (err) {
//         console.log("err in purchase or sell units mutation", err);
//         return err;
//       }
//     },

//     async sellUnits(parent, args, context, info) {
//       try {
//       } catch (err) {
//         console.log("sell units catch err", err);
//         return err;
//       }
//     },
//   },
//   Query: {
//     async getTrades(parents, args, context, info) {
//       try {
//         let { Trades } = context.collections;
//         let { byUser } = args.input;
//         let tradeResults = [];

//         let filter = { createdBy: byUser };
//         tradeResults = await Trades.find(byUser ? filter : {}).toArray();
//         console.log(tradeResults);
//         return tradeResults;
//       } catch (err) {
//         console.log("get trades error ", err);
//       }
//     },
//     async getTradesForProperty(parents, args, context, info) {
//       try {
//         let { productId } = args;
//         let { auth, authToken, userId, collections } = context;
//         let { Trades } = collections;
//         if (!productId) {
//           throw new Error("invalid product");
//         }

//         if (!authToken || !userId) {
//           throw new Error("Unauthorized");
//         }
//         let decodedId = decodeOpaqueId(productId);
//         let tradeResults = await Trades.find().toArray();
//         return tradeResults;
//       } catch (err) {
//         console.log("get trades error ", err);
//         return err;
//       }
//     },
//     async getUnitOwnership(parents, args, context, info) {
//       try {
//         let { productId, ownerId } = args;
//         let { authToken, userId, collections } = context;
//         let { Ownership } = collections;
//         console.log("owner id ", ownerId);
//         const owner = await Ownership.find({ ownerId }).toArray();
//         console.log("owner is ", owner);
//         return owner;
//       } catch (err) {
//         console.log("error in get unit ownership", err);
//         return err;
//       }
//     },
//   },
// };
