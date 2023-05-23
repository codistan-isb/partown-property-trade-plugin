import ObjectID from "mongodb";
import decodeOpaqueId from "@reactioncommerce/api-utils/decodeOpaqueId.js";
import validateMinQty from "../util/validateMinQty.js";
import checkUserWallet from "../util/checkUserWallet.js";
import updateWallet from "../util/updateWallet.js";
import verifyOwnership from "../util/verifyOwnership.js";
import updateAvailableQuantity from "../util/updateAvailableQuantity.js";
import updateTradeUnits from "../util/updateTradeUnits.js";
import updateOwnership from "../util/updateOwnership.js";
import closeTrade from "../util/closeTrade.js";
import validateUser from "../util/validateUser.js";
import createTradeTransaction from "../util/createTradeTransaction.js";
// import createNotification from "../util/createNotification.js";
import markAsRead from "../util/markAsRead.js";
import sendEmailOrPhoneNotification from "../util/sendEmailOrPhoneNotification.js";
import buyerNotification from "../util/buyerNotification.js";
import checkTradeExpiry from "../util/checkTradeExpiry.js";
import removeOwnership from "../util/removeOwnership.js";

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
        createdBy,
        currencyUnit,
        cancellationReason,
      } = args.input;
      let { authToken, userId, collections } = context;

      let { Transactions, Accounts, Catalog, Products, Trades, Ownership } =
        collections;

      if (!authToken || !userId) return new Error("Unauthorized");
      // await sendEmailOrPhoneNotification(
      //   context,
      //   "accounts/verifyEmail",
      //   userId
      // );

      let decodedSellerId = decodeOpaqueId(sellerId).id;
      let decodedProductId = decodeOpaqueId(productId).id;

      if (!authToken || !userId) return new Error("Unauthorized");
      await validateUser(context, userId);

      let checkOwnerExist = await Ownership.findOne({
        ownerId: decodeOpaqueId(userId).id,
        productId: decodeOpaqueId(productId).id,
      });

      if (!checkOwnerExist) return new Error("You don't own this property");

      if (
        checkOwnerExist?.isPrimaryOwner === null ||
        checkOwnerExist?.isPrimaryOwner !== true
      )
        return new Error(
          "You need to wait for the property to be opened to resale market"
        );

      if (checkOwnerExist?.amount < area)
        return new Error(
          `You own ${checkOwnerExist?.amount} sqm for this property, you cannot sell more than that`
        );

      let decodedId = decodeOpaqueId(productId).id;

      const { product } = await Catalog.findOne({
        "product._id": decodedId,
      });

      if (product?.propertySaleType?.type !== "Primary")
        return new Error("Not a primary property");

      if (minQty > area)
        return new Error(
          "Minimum Quantity cannot be greater than the quantity specified"
        );

      let primaryTradeCheck = await Trades.findOne({
        productId: product?._id,
        isCancelled: { $ne: true },
        completionStatus: { $ne: "completed" },
      });

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
        originalQuantity: area,
        expirationTime,
        tradeType: "offer",
        minQty,
        productId: decodedId,
        approvalStatus: "pending",
        // tradeStatus: "inProgress",
        completionStatus: "inProgress",
        isDisabled: false,
        createdBy: decodeOpaqueId(createdBy).id,
      };

      if (product?._id) {
        const { insertedId } = await Trades.insertOne(data);
        if (insertedId) {
          await updateOwnership(
            collections,
            decodedSellerId,
            decodedProductId,
            area
          );
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
      const { Ownership, Catalog, Accounts, Trades, ProductRate } = collections;

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

      await checkTradeExpiry(collections, tradeId);
      await validateUser(context, userId);

      let userAccount = await Accounts.findOne({ userId });

      let userTransactionId = userAccount?.profile?.transactionId
        ? userAccount?.profile?.transactionId
        : "n/a";

      const decodedProductId = decodeOpaqueId(productId).id;
      const decodedTradeId = decodeOpaqueId(tradeId).id;
      const allOwners = await Ownership.find({
        productId: decodedProductId,
      }).toArray();

      // const totalPrice = units * price;
      //1% service charge
      let rates = await ProductRate.findOne({ productType: "Primary" });
      // console.log("rates are ", rates);
      let buyerFee = 0;
      let sellerFee = 0;
      if (rates?.buyerFee) {
        buyerFee = (rates.buyerFee / 100) * price;
      }
      if (rates?.sellerFee) {
        sellerFee = (rates.sellerFee / 100) * price;
      }

      await checkUserWallet(
        collections,
        decodeOpaqueId(userId).id,
        price + buyerFee
      );

      await validateMinQty(collections, decodedTradeId, units);

      const { product } = await Catalog.findOne({
        "product._id": decodedProductId,
      });

      let sum = [];
      if (allOwners.length > 1) {
        sum = await Ownership.aggregate([
          {
            $match: {
              productId: decodedProductId,
              ownerId: { $ne: decodeOpaqueId(sellerId).id },
            },
          },
          { $group: { _id: "$productId", totalUnits: { $sum: "$amount" } } },
        ]).toArray();
      }

      let totalSum = sum[0]?.totalUnits;

      // console.log("total sum is ", totalSum);

      if (totalSum === product?.area?.value) {
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

      const filter = {
        ownerId: decodeOpaqueId(userId).id,
        productId: decodedProductId,
      };
      const update = {
        $inc: { amount: units },
        $setOnInsert: {
          productId: decodedProductId,
          tradeId: decodedTradeId,
          ownerId: decodeOpaqueId(userId).id,
        },
        $push: {
          ownershipHistory: {
            price: price,
            quantity: units,
            date: new Date(),
            tradeType: "buy",
          },
        },
      };
      const options = { upsert: true, returnOriginal: false };
      const { lastErrorObject } = await Ownership.findOneAndUpdate(
        filter,
        update,
        options
      );

      const netBuyerPrice = price + buyerFee;
      const netSellerPrice = price - sellerFee;
      const netServiceCharge = buyerFee + sellerFee;
      if (lastErrorObject?.n > 0) {
        const { result } = await Ownership.update(
          { ownerId: decodeOpaqueId(sellerId).id, productId: decodedProductId },
          { $inc: { unitsEscrow: -units } }
        );

        // update buyer funds
        await updateWallet(
          collections,
          decodeOpaqueId(userId).id,
          -netBuyerPrice
        );

        // update seller funds
        await updateWallet(
          collections,
          decodeOpaqueId(sellerId).id,
          netSellerPrice
        );

        //update admin/platform funds
        await updateWallet(
          collections,
          decodeOpaqueId(process.env.ADMIN_ID).id,
          netServiceCharge
        );

        // await updateAvailableQuantity(collections, decodedProductId, -units);
        await updateTradeUnits(collections, decodedTradeId, -units, minQty);
        await closeTrade(collections, decodedTradeId);

        // userTransactionId
        await createTradeTransaction(context, {
          amount: netBuyerPrice,
          approvalStatus: "completed",
          transactionBy: userId,
          transactionId: userTransactionId,
          tradeTransactionType: "buy",
          unitsQuantity: units,
          serviceCharges: {
            buyer: buyerFee,
            seller: sellerFee,
            total: netServiceCharge,
          },
          tradeBy: decodeOpaqueId(sellerId).id,
          productId: decodedProductId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        //verified whether all units of the seller are sold
        await removeOwnership(collections, sellerId, productId);

        await buyerNotification(
          context,
          userId,
          product?.title,
          units,
          "You",
          userAccount?.profile?.picture
        );
        await buyerNotification(
          context,
          decodeOpaqueId(sellerId).id,
          product?.title,
          units,
          `${userAccount?.profile?.firstName} ${userAccount?.profile?.lastName}`,
          userAccount?.profile?.picture
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
      const {
        productId,
        price,
        area,
        buyerId,
        sellerId,
        expirationTime,
        tradeType,
        minQty,
        createdBy,
      } = args.input;
      const { auth, authToken, userId, collections } = context;
      const {
        Transactions,
        Accounts,
        Catalog,
        Products,
        Trades,
        Ownership,
        ProductRate,
      } = collections;

      if (!authToken || !userId) throw new Error("Unauthorized");

      await validateUser(context, userId);

      const ownerId = decodeOpaqueId(userId).id;
      const decodedProductId = decodeOpaqueId(productId).id;
      const ownerRes = await Ownership.findOne({
        ownerId: ownerId,
        productId: decodedProductId,
      });

      const rates = await ProductRate.findOne({ productType: "Resale" });
      const buyerFee = rates?.buyerFee
        ? (rates.buyerFee / 100) * price * area
        : 0;
      const totalAmount = price * area + buyerFee;

      if (tradeType === "offer" && !ownerRes)
        throw new Error("You don't own this property");

      if (minQty > area)
        throw new Error(
          "Minimum Quantity cannot be greater than the quantity specified"
        );

      if (tradeType === "offer" && ownerRes?.amount < area) {
        throw new Error(`You cannot sell more than ${ownerRes?.amount} units`);
      }

      if (tradeType === "bid") {
        await checkUserWallet(collections, userId, totalAmount);
      }

      const { product } = await Catalog.findOne({
        "product._id": decodedProductId,
      });

      if (!product) {
        throw new Error("Property not found");
      }

      let primaryTradeCheck = await Trades.find({ productId: product?._id });

      if (primaryTradeCheck && product?.propertySaleType?.type === "Primary") {
        throw new Error("Cannot create multiple trades for primary property");
      }

      if (product.area.value < area) {
        throw new Error(
          "The amount you specified is greater than the total available for this property"
        );
      }

      const createdAt = new Date();
      const data = {
        ...(tradeType === "offer"
          ? { sellerId: ownerId }
          : { buyerId: ownerId }),
        price,
        area,
        originalQuantity: area,
        expirationTime,
        tradeType,
        minQty,
        productId: decodedProductId,
        approvalStatus: "pending",
        createdBy: decodeOpaqueId(createdBy).id,
        completionStatus: "inProgress",
        isDisabled: false,
        createdAt,
        updatedAt: createdAt,
      };

      const { insertedId } = await Trades.insertOne(data);

      if (!insertedId) throw new Error("Error creating Trade");

      if (buyerId) {
        await Accounts.updateOne(
          { _id: decodeOpaqueId(buyerId).id },
          {
            $inc: {
              "wallets.amount": -1 * totalAmount,
              "wallets.escrow": totalAmount,
            },
          }
        );
      } else if (sellerId) {
        await updateOwnership(
          collections,
          decodeOpaqueId(sellerId).id,
          decodedProductId,
          area
        );
      }

      return { _id: insertedId };
    } catch (err) {
      throw err;
    }
  },

  async makePrimaryOwner(parent, args, context, info) {
    try {
      let { collections } = context;
      let { Transactions, Accounts, Catalog, Ownership } = collections;

      const { ownerId, productId } = args;
      const { id } = decodeOpaqueId(productId);

      const ownerCheck = await Ownership.findOne({
        productId: id,
      });
      console.log("owner check is ", ownerCheck);
      if (ownerCheck)
        return new Error(
          "You have already assigned an owner for this property"
        );

      const { product, propertySaleType } = await Catalog.findOne({
        "product._id": id,
      });
      let totalValue = product?.area?.value;
      console.log("property sale type is ", propertySaleType);
      if (propertySaleType?.type !== "Primary")
        return new Error("Not a primary property");

      let data = {
        ownerId: decodeOpaqueId(ownerId).id,
        amount: totalValue,
        unitsEscrow: 0,
        productId: id,
        isPrimaryOwner: true,
      };

      let ownerToFind = await Accounts.findOne({
        _id: decodeOpaqueId(ownerId).id,
      });

      if (!ownerToFind) return new Error("User does not exist");

      const { result } = await Ownership.insertOne(data);
      if (result) {
        await updateAvailableQuantity(collections, id, -totalValue);
        return true;
      }
      return false;
    } catch (err) {
      console.log("err in make primary owner mutation ", err);
      return err;
    }
  },
  async makeResaleOwner(parent, args, context, info) {
    try {
      let { collections } = context;
      let { Transactions, Accounts, Catalog, Ownership } = collections;

      const { ownerId, productId, units } = args;
      const { id } = decodeOpaqueId(productId);

      const { product, propertySaleType } = await Catalog.findOne({
        "product._id": id,
      });

      // console.log("product is ", product)
      console.log("product sale type ", propertySaleType);

      // let totalValue = product?.area?.value;
      let remainingValue = product?.area?.availableQuantity;

      console.log("sale type is ", propertySaleType);
      if (propertySaleType?.type !== "Resale")
        return new Error("Not a resale property");

      if (units > remainingValue)
        return new Error(
          `You can only assign ownership for ${remainingValue} remaining Units`
        );

      // let data = {
      //   ownerId: decodeOpaqueId(ownerId).id,
      //   amount: units,
      //   unitsEscrow: 0,
      //   productId: id,
      // };

      let ownerToFind = await Accounts.findOne({
        _id: decodeOpaqueId(ownerId).id,
      });

      if (!ownerToFind) return new Error("User does not exist");
      const filter = {
        ownerId: decodeOpaqueId(ownerId).id,
        productId: decodeOpaqueId(productId).id,
      };
      const update = {
        $inc: { amount: units },
        $setOnInsert: {
          unitsEscrow: 0,
          ownerId: decodeOpaqueId(ownerId).id,
          productId: decodeOpaqueId(productId).id,
        },
      };
      const options = { upsert: true };

      const { lastErrorObject } = await Ownership.findOneAndUpdate(
        filter,
        update,
        options
      );
      console.log("last error object", lastErrorObject);
      if (lastErrorObject?.n > 0) {
        await updateAvailableQuantity(collections, id, -units);
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
      const { authToken, userId, collections } = context;
      const { Ownership, ProductRate, Accounts } = collections;
      const {
        sellerId,
        productId,
        tradeId,
        tradeType,
        units,
        price,
        buyerId,
        serviceCharge,
        minQty,
      } = args.input;

      if (!authToken || !userId) return new Error("Unauthorized");
      await validateUser(context, userId);

      const decodedBuyerId = decodeOpaqueId(buyerId).id;
      const decodedSellerId = decodeOpaqueId(sellerId).id;
      const decodedProductId = decodeOpaqueId(productId).id;
      const decodedTradeId = decodeOpaqueId(tradeId).id;

      let rates = await ProductRate.findOne({ productType: "Resale" });
      let buyerFee = 0;
      let sellerFee = 0;
      if (rates?.buyerFee) {
        buyerFee = (rates.buyerFee / 100) * price;
      }
      if (rates?.sellerFee) {
        sellerFee = (rates.sellerFee / 100) * price;
      }
      await checkUserWallet(collections, decodedBuyerId, price + buyerFee);
      await validateMinQty(collections, decodedTradeId, units);

      console.log("validating min quantity");

      const filter = { ownerId: decodedBuyerId, productId: decodedProductId };
      const update = {
        $inc: { amount: units },
        $setOnInsert: {
          productId: decodedProductId,
          tradeId: decodedTradeId,
          ownerId: decodedBuyerId,
        },
        $push: {
          ownershipHistory: {
            price: price,
            quantity: units,
            tradeType: "buy",
            date: new Date(),
          },
        },
      };

      const options = { upsert: true, returnOriginal: false };

      // Update buyer ownership
      const { lastErrorObject } = await Ownership.findOneAndUpdate(
        filter,
        update,
        options
      );

      // return false;

      if (lastErrorObject?.n > 0) {
        // Update seller ownership
        const { result } = await Ownership.updateOne(
          {
            ownerId: decodedSellerId,
            productId: decodedProductId,
          },
          { $inc: { unitsEscrow: -units } }
        );

        const netBuyerPrice = price + buyerFee;
        const netSellerPrice = price - sellerFee;
        const netServiceCharge = buyerFee + sellerFee;

        let userAccount = await Accounts.findOne({ userId });

        let userTransactionId = userAccount?.profile?.transactionId
          ? userAccount?.profile?.transactionId
          : "n/a";

        // Update buyer, seller, and platform wallets
        await Promise.all([
          updateWallet(collections, decodedBuyerId, -netBuyerPrice),

          updateWallet(collections, decodedSellerId, netSellerPrice),
          updateWallet(
            collections,
            decodeOpaqueId(process.env.ADMIN_ID).id,
            netServiceCharge
          ),
          updateTradeUnits(collections, decodedTradeId, -units, minQty),
        ]);
        await closeTrade(collections, decodedTradeId);
        await createTradeTransaction(context, {
          amount: netBuyerPrice,
          approvalStatus: "completed",
          transactionBy: userId,
          transactionId: userTransactionId,
          tradeTransactionType: "buy",
          unitsQuantity: units,
          serviceCharges: {
            buyer: buyerFee,
            seller: sellerFee,
            total: netServiceCharge,
          },
          tradeBy: decodeOpaqueId(sellerId).id,
          productId: decodedProductId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

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
      let { Ownership, ProductRate, Accounts } = collections;
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
      await validateUser(context, userId);
      let decodedTradeId = decodeOpaqueId(tradeId).id;
      let decodedBuyerId = decodeOpaqueId(buyerId).id;

      let rates = await ProductRate.findOne({ productType: "Resale" });
      let buyerFee = 0;
      let sellerFee = 0;
      if (rates?.buyerFee) {
        buyerFee = (rates.buyerFee / 100) * price;
      }
      if (rates?.sellerFee) {
        sellerFee = (rates.sellerFee / 100) * price;
      }
      await verifyOwnership(
        collections,
        decodeOpaqueId(sellerId).id,
        decodeOpaqueId(productId).id,
        units
      );
      await validateMinQty(collections, decodeOpaqueId(tradeId).id, units);
      const filter = {
        ownerId: decodeOpaqueId(buyerId).id,
        productId: decodeOpaqueId(productId).id,
      };
      const update = {
        $inc: { amount: units },
        $setOnInsert: {
          productId: decodeOpaqueId(productId).id,
          tradeId: decodeOpaqueId(tradeId).id,
          ownerId: decodeOpaqueId(buyerId).id,
        },
        $push: {
          ownershipHistory: {
            price: price,
            quantity: units,
            tradeType: "sell",
            date: new Date(),
          },
        },
      };

      let userAccount = await Accounts.findOne({ userId });

      let userTransactionId = userAccount?.profile?.transactionId
        ? userAccount?.profile?.transactionId
        : "n/a";

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
          {
            ownerId: decodeOpaqueId(sellerId).id,
            productId: decodeOpaqueId(productId).id,
          },
          { $inc: { amount: -units } }
        );
        const netBuyerPrice = price + buyerFee;
        const netSellerPrice = price - sellerFee;
        const netServiceCharge = buyerFee + sellerFee;
        await Promise.all([
          // updateWallet(collections, decodedBuyerId, -netBuyerPrice),

          Accounts.updateOne(
            { _id: decodedBuyerId },
            {
              $inc: { "wallets.escrow": -netBuyerPrice },
            }
          ),

          updateWallet(
            collections,
            decodeOpaqueId(sellerId).id,
            netSellerPrice
          ),
          updateWallet(
            collections,
            decodeOpaqueId(process.env.ADMIN_ID).id,
            netServiceCharge
          ),
          updateTradeUnits(collections, decodedTradeId, -units),
          closeTrade(collections, decodedTradeId),

          createTradeTransaction(context, {
            amount: netBuyerPrice,
            approvalStatus: "completed",
            transactionBy: userId,
            transactionId: userTransactionId,
            tradeTransactionType: "sell",
            unitsQuantity: units,
            serviceCharges: {
              buyer: buyerFee,
              seller: sellerFee,
              total: netServiceCharge,
            },
            tradeBy: decodeOpaqueId(buyerId).id,
            productId: decodeOpaqueId(productId).id,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),

          removeOwnership(collections, sellerId, productId),
        ]);
        return result?.n > 0;
      }

      return false;
    } catch (err) {
      return err;
    }
  },
  async voteProperty(parent, args, context, info) {
    try {
      let { authToken, userId, collections } = context;
      let { Votes, Catalog } = collections;
      let { productId, voteType } = args.input;
      let currentTime = new Date();
      if (!authToken || !userId) return null;
      let decodedProductId = decodeOpaqueId(productId).id;
      const { product } = await Catalog.findOne({
        "product._id": decodedProductId,
      });

      console.log("product is ", product);

      if (product?.propertySaleType?.type !== "Premarket")
        return new Error("Property is not in the pre-market stage");

      if (product?.expiryTime < currentTime) return false;

      const filter = {
        userId,
        productId: decodedProductId,
      };
      const update = {
        $set: { voteType },
        $setOnInsert: {
          productId: decodedProductId,
          userId,
        },
      };
      const options = { upsert: true, returnOriginal: false };
      const { lastErrorObject } = await Votes.findOneAndUpdate(
        filter,
        update,
        options
      );

      return lastErrorObject?.n > 0;
    } catch (err) {
      return err;
    }
  },
  async disableTrade(parent, { tradeId }, context, info) {
    try {
      const { authToken, userId, collections } = context;
      const { Trades } = collections;
      let decodedTradeId = decodeOpaqueId(tradeId).id;
      const trade = Trades.updateOne(
        {
          _id: ObjectID.ObjectId(tradeId),
          createdBy: userId,
        },
        { $set: { isDisabled: true } }
      );
    } catch (err) {
      return err;
    }
  },
  async cancelTrade(parent, { tradeId, propertyType }, context, info) {
    try {
      const { authToken, userId, collections } = context;
      const { Trades, Ownership, Accounts, ProductRate } = collections;

      if (!userId || !authToken) return new Error("Unauthorized");

      const res = await Trades.findOne({ _id: ObjectID.ObjectId(tradeId) });

      const rates = await ProductRate.findOne({ productType: propertyType });

      let tradeType = res?.tradeType;
      let area = res?.area;
      let price = res?.price;
      let initial = area * price;

      let buyerFee = (rates.buyerFee / 100) * initial;
      let total = initial + buyerFee;

      let productId = res?.productId;

      // return null;

      const { result } = await Trades.updateOne(
        {
          _id: ObjectID.ObjectId(tradeId),
          createdBy: userId,
        },
        { $set: { isCancelled: true } }
      );

      console.log("result is", result);
      console.log("trade type incoming is ", tradeType);
      console.log("area is ", area);

      if (result?.n > 0) {
        if (tradeType === "offer") {
          await Ownership.updateOne(
            {
              ownerId: userId,
              productId: decodeOpaqueId(productId).id,
            },
            { $inc: { unitsEscrow: -area, amount: area } }
          );
        } else if (tradeType === "bid") {
          await Accounts.updateOne(
            { _id: userId },
            {
              $inc: {
                "wallets.escrow": -total,
                "wallets.amount": total,
              },
            }
          );
        }
      }

      return true;
    } catch (err) {
      return err;
    }
  },
  async editTrade(parent, args, context, info) {
    try {
      const { authToken, userId, collections } = context;
      const { Trades, Ownership } = collections;

      const {
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

      console.log("product id is ", productId);
      let decodedProductId = decodeOpaqueId(productId).id;

      // return new Error("testing product id")

      if (!userId || !authToken) return new Error("Unauthorized");

      let owner = await Ownership.findOne({
        ownerId: userId,
        productId: decodedProductId,
      });
      let sum = owner?.amount + owner?.unitsEscrow;
      if (area > sum)
        return new Error("You cannot edit offer for more than you own");

      let unitsToUpdate = area - owner.unitsEscrow;

      let decodedTradeId = decodeOpaqueId(args.tradeId).id;

      let foundedTrade = await Trades.findOne(
        {
          _id: ObjectID.ObjectId(decodedTradeId),
          createdBy: userId,
        },
        { $set: { price, area, minQty, expirationTime } }
      );

      console.log("founded trade is ", foundedTrade);

      let { result } = await Trades.updateOne(
        {
          _id: ObjectID.ObjectId(decodedTradeId),
          createdBy: userId,
          completionStatus: { $ne: "completed" },
        },
        { $set: { price, area, minQty, expirationTime } }
      );
      if (result?.n > 0 && foundedTrade?.tradeType === "offer") {
        await Ownership.update(
          {
            ownerId: userId,
            productId: decodedProductId,
          },
          { $inc: { amount: -unitsToUpdate, unitsEscrow: unitsToUpdate } }
        );
      } else if (result?.n > 0 && foundedTrade?.tradeType === "bid") {
        await Accounts.update(
          {
            _id: userId,
          },
          {
            $inc: {
              "wallets.amount": -unitsToUpdate,
              "wallets.escrow": unitsToUpdate,
            },
          }
        );
      }

      return result?.n > 0;
    } catch (err) {
      return err;
    }
  },
  async createNotification(parent, args, context, info) {
    let result = await context.mutations.createNotification(
      context,
      args.input
    );
    return result;
  },
  async markAsRead(parent, args, context, info) {
    console.log("markAsRead", args);
    let mkr = await markAsRead(context, args);
    return mkr;
  },
  async clearNotification(parent, { notificationId }, context, info) {
    try {
      const { userId, authToken, collections } = context;
      const { Notifications } = collections;
      if (!userId || !authToken) return new Error("Unauthorized");

      if (notificationId) {
        const { result } = await Notifications.updateOne(
          {
            _id: notificationId,
            to: userId,
          },
          { $set: { isCleared: true } }
        );
        return result?.n > 0;
      } else if (!notificationId) {
        const { result } = await Notifications.updateMany(
          {
            to: userId,
          },
          { $set: { isCleared: true } }
        );

        return result?.n > 0;
      }
      return false;
    } catch (err) {
      return err;
    }
  },
  async editOwnership(parent, args, context, info) {
    try {
      const { userId, authToken, collections } = context;
      const { Ownership } = collections;

      const { _id } = args;
      const res = await Ownership.updateOne(
        {
          _id: ObjectID.ObjectID(_id),
        },
        {}
      );
    } catch (err) {
      return err;
    }
  },
  async removeOwner(parent, { ownershipId }, context, info) {
    try {
      const { userId, authToken, collections } = context;
      const { Catalog, Ownership } = collections;

      const { amount, productId } = await Ownership.findOne({
        _id: ObjectID.ObjectId(ownershipId),
      });

      const { product } = await Catalog.findOne({
        "product._id": productId,
      });

      if (product?.area?.availableQuantity !== amount)
        return new Error(
          "Cannot remove this user as owner, this user has already opened their units up for trading."
        );

      let { result: removedOwner } = await Ownership.deleteOne({
        _id: ObjectID.ObjectId(ownershipId),
      });
      if (removedOwner) {
        const { result } = await Catalog.updateOne(
          {
            "product._id": productId,
          },
          { $inc: { "product.area.availableQuantity": amount } }
        );
        return result?.n > 0;
      }
      return false;
    } catch (err) {
      return err;
    }
  },
  async addDividend(parent, args, context, info) {
    try {
      const { userId, authToken, collections } = context;
      const { Dividends } = collections;

      // if (!userId || !authToken) return new Error("Unauthorized");
      console.log("args input ", args.input);
      const { dividendTo, amount, productId, dividendBy } = args.input;

      let dividends = dividendTo.map((item) => {
        return { dividendsTo: item, amount, productId, dividendBy };
      });

      const res = Promise.all(
        dividends.map((item) => {
          Dividends.insert(item);
        })
      );

      console.log("res is ", res);
      return false;
    } catch (err) {
      return err;
    }
  },
};
