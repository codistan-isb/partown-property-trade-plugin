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
import generateSignedUrl from "../util/getSignedUrl.js";
import tradeNotification from "../util/tradeNotification.js";
import sendDividendNotification from "../util/sendDividendNotification.js";
import checkTrusteeWallet from "../util/checkTrusteeWallet.js";
import ReactionError from "@reactioncommerce/reaction-error";
import addDividendAmount from "../util/addDividendAmount.js";
import calculateSellerEscrowDeduction from "../util/calculateSellerEscrowDeduction.js";
import propertyEventNotification from "../util/propertyEventNotification.js";
import sendDividendPayoutNotification from "../util/sendDividendPayoutNotification.js";
import sendOwnershipAssignedNotification from "../util/sendOwnershipAssignedNotification.js";
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

      let {
        Transactions,
        Accounts,
        Catalog,
        Products,
        Trades,
        Ownership,
        ProductRate,
      } = collections;

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

      const { product } = await Catalog.findOne({
        "product._id": decodedProductId,
      });

      if (!product?.activeStatus) {
        return new Error("This property has been removed from the market");
      }

      if (!expirationTime) {
        const currentDate = new Date();
        expirationTime = new Date(
          currentDate.getTime() + 7 * 24 * 60 * 60 * 1000
        );
      }

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

      const rates = await ProductRate.findOne({
        productType: "Primary",
      });

      const sellerFee = rates?.sellerFee
        ? (rates.sellerFee / 100) * price * area
        : 0;

      console.log("seller fee is ", sellerFee);

      const buyerFee = rates?.buyerFee
        ? (rates.buyerFee / 100) * price * area
        : 0;

      await checkUserWallet(collections, decodedSellerId, sellerFee);

      let decodedId = decodeOpaqueId(productId).id;

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
        sellerFee: { fee: sellerFee, percentage: rates?.sellerFee },
        buyerFee: { fee: buyerFee, percentage: rates?.buyerFee },
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
          await Accounts.updateOne(
            {
              _id: decodedSellerId,
            },
            {
              $inc: {
                "wallets.amount": -sellerFee,
                "wallets.escrow": sellerFee,
              },
            }
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

      const { _id: adminId } = await Accounts.findOne({
        "adminUIShopIds.0": { $ne: null, $exists: true },
      });

      //function to check whether the trade is expired
      await checkTradeExpiry(collections, tradeId);

      // function validate whether the user is eligible to subscribe to the property
      await validateUser(context, userId);

      let userAccount = await Accounts.findOne({ userId });

      let userTransactionId = userAccount?.profile?.transactionId
        ? userAccount?.profile?.transactionId
        : "n/a";

      const decodedProductId = decodeOpaqueId(productId).id;
      const decodedTradeId = decodeOpaqueId(tradeId).id;
      const decodedSellerId = decodeOpaqueId(sellerId).id;
      const allOwners = await Ownership.find({
        productId: decodedProductId,
      }).toArray();

      //current service charge service charge
      let rates = await ProductRate.findOne({ productType: "Primary" });
      let buyerFee = 0;
      let sellerFee = 0;
      if (rates?.buyerFee) {
        buyerFee = (rates.buyerFee / 100) * price;
      }
      if (rates?.sellerFee) {
        sellerFee = (rates.sellerFee / 100) * price;
      }

      let { profile: buyerProfile } = await Accounts.findOne({
        _id: userId,
      });

      //function to check trade validity and trade completion
      await validateMinQty(collections, decodedTradeId, units);

      //function to check whether the subscriber/buyer has enough amount available in their wallet
      await checkUserWallet(
        collections,
        decodeOpaqueId(userId).id,
        price + buyerFee
      );

      // we will find the property to get the manager/trustee id for that property
      const { product } = await Catalog.findOne({
        "product._id": decodedProductId,
      });

      const decodedManagerId = decodeOpaqueId(product?.manager).id;

      /*  we will sum all the ownerships and validate against the total value of the property. 
      If the sum is equal to the total value of the property, it means the property has been fully purchased */
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

      if (totalSum === product?.area?.value) {
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

        // update buyer funds after successful transaction
        await updateWallet(
          collections,
          decodeOpaqueId(userId).id,
          -netBuyerPrice
        );

        // update seller funds after successful transaction
        await updateWallet(
          collections,
          decodeOpaqueId(sellerId).id,
          netSellerPrice
        );

        //update manager/trustee wallet after successful transaction
        await updateWallet(collections, decodedManagerId, buyerFee);

        //update admin/platform funds after successful transaction
        await updateWallet(collections, adminId, sellerFee);

        await updateTradeUnits(collections, decodedTradeId, -units, minQty);

        //if the trade units has been used completely after current transaction, the trade will be closed
        await closeTrade(collections, decodedTradeId);

        // creates a transaction record against the user, this is to be moved to a global function for easier management
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

        // calculate and deducts the amount to be deducted from the seller escrow, also updates the record for trade
        await calculateSellerEscrowDeduction(
          collections,
          decodedSellerId,
          decodedTradeId,
          price
        );

        /*verified whether all units of the seller are sold, if all of the units are sold, the seller is no longer the 
        owner and as such should be removed from the owner collection */
        await removeOwnership(collections, sellerId, productId);

        //****buyer, seller, trustee, admin notification
        const productTitle = product?.title;
        const productSlug = product?.slug;

        //buyer
        await tradeNotification(
          context,
          userId,
          productTitle,
          units,
          price,
          productSlug,
          "Congratulations, you have successfully purchased this property"
        );

        //seller
        await tradeNotification(
          context,
          decodedSellerId,
          productTitle,
          units,
          price,
          productSlug,
          "Congratulations!, someone subscribed to your property."
        );

        //trustee
        await tradeNotification(
          context,
          decodedManagerId,
          productTitle,
          units,
          price,
          productSlug,
          "A trade was successfully completed against the property you are managing"
        );

        //admin/platform
        await tradeNotification(
          context,
          adminId, //admin id
          productTitle,
          units,
          price,
          productSlug
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

      //check whether user is permitted to trade
      await validateUser(context, userId);

      //if no expiry time is provided, set default 1 week from current date
      if (!expirationTime) {
        const currentDate = new Date();
        expirationTime = new Date(
          currentDate.getTime() + 7 * 24 * 60 * 60 * 1000
        );
      }

      const ownerId = decodeOpaqueId(userId).id;
      const decodedProductId = decodeOpaqueId(productId).id;
      const ownerRes = await Ownership.findOne({
        ownerId: ownerId,
        productId: decodedProductId,
      });

      const { product } = await Catalog.findOne({
        "product._id": decodedProductId,
      });

      if (!product?.activeStatus || product?.activeStatus === false) {
        return new Error("This property has been removed from the marketplace");
      }

      const rates = await ProductRate.findOne({ productType: "Resale" });

      // calculate the buyer and seller fee against the trade value
      const buyerFee = rates?.buyerFee
        ? (rates.buyerFee / 100) * price * area
        : 0;
      const sellerFee = rates?.sellerFee
        ? (rates.sellerFee / 100) * price * area
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

      //if the user is trying to purchase units, validate user wallet
      if (tradeType === "bid") {
        await checkUserWallet(collections, userId, totalAmount);
      }

      if (tradeType === "offer") {
        //checking seller wallet whehter the seller has enough amount to compensate seller fee for trade
        await checkUserWallet(collections, userId, sellerFee);
      }

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
        buyerFee: { fee: buyerFee, percentage: rates?.buyerFee },
        sellerFee: { fee: sellerFee, percentage: rates?.sellerFee },
      };

      const { insertedId } = await Trades.insertOne(data);

      if (!insertedId) throw new Error("Error creating Trade");

      if (buyerId) {
        // transfer total Trade value from user's wallet to escrow
        await Accounts.updateOne(
          { _id: decodeOpaqueId(buyerId).id },
          {
            $inc: {
              "wallets.amount": -totalAmount,
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

        // transfer seller fee from user's wallet to escrow
        await Accounts.updateOne(
          { _id: decodeOpaqueId(sellerId).id },
          {
            $inc: {
              "wallets.amount": -1 * sellerFee,
              "wallets.escrow": sellerFee,
            },
          }
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

      const propertyTitle = product?.title;
      const slug = product?.slug;
      const units = product?.area?.value
      //ownership assigned notification to owner
      await sendOwnershipAssignedNotification(
        context,
        decodeOpaqueId(ownerId).id,
        "Ownership To a new Property",
        "You have been assigned ownership to a property",
        propertyTitle,
        units,
        "You have been assigned ownership of a property",
        slug
      );

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

      const propertyTitle = product?.title;
      const slug = product?.slug;
      //ownership assigned notification to owner
      await sendOwnershipAssignedNotification(
        context,
        decodeOpaqueId(ownerId).id,
        "Ownership To a new Property",
        "You have been assigned ownership to a property",
        propertyTitle,
        units,
        "You have been assigned ownership of a property",
        slug
      );

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
      const { Ownership, ProductRate, Accounts, Catalog } = collections;
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

      console.log("product id from input is ", productId);

      if (!authToken || !userId) return new Error("Unauthorized");
      await validateUser(context, userId);

      const { _id: adminId } = await Accounts.findOne({
        "adminUIShopIds.0": { $ne: null, $exists: true },
      });

      const decodedBuyerId = decodeOpaqueId(buyerId).id;
      const decodedSellerId = decodeOpaqueId(sellerId).id;
      const decodedProductId = decodeOpaqueId(productId).id;
      const decodedTradeId = decodeOpaqueId(tradeId).id;

      console.log("decoded product id", decodedProductId);
      const { product } = await Catalog.findOne({
        "product._id": decodedProductId,
      });

      //decoded manger id for manager wallet adjustment

      console.log("product?.manager is ", product?.manager);
      console.log("product is ", product);
      const decodedManagerId = product?.manager;

      if (product?.activeStatus === false || product?.isVisible === false) {
        return new Error("This property has been removed from the marketplace");
      }

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

        // Update buyer, seller, manager, and  platform wallets
        await Promise.all([
          updateWallet(collections, decodedBuyerId, -netBuyerPrice),

          updateWallet(collections, decodedSellerId, netSellerPrice),

          updateWallet(collections, decodedManagerId, buyerFee),

          //needs updation
          updateWallet(collections, adminId, sellerFee),
          updateTradeUnits(collections, decodedTradeId, -units, minQty),
        ]);

        //we are deducting the escrow amount from seller wallet, this should also update the seller fee in the trade record.
        await calculateSellerEscrowDeduction(
          collections,
          decodedSellerId,
          decodedTradeId,
          price
        );

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

        await closeTrade(collections, decodedTradeId);

        //****buyer, seller, trustee, admin notification
        const productTitle = product?.title;
        const productSlug = product?.slug;

        //buyer
        await tradeNotification(
          context,
          userId,
          productTitle,
          units,
          price,
          productSlug,
          "Congratulations, you have successfully purchased this property"
        );

        //seller
        await tradeNotification(
          context,
          decodedSellerId,
          productTitle,
          units,
          price,
          productSlug,
          "Congratulations!, someone purchased property units against an offer you created"
        );

        //trustee
        await tradeNotification(
          context,
          decodedManagerId,
          productTitle,
          units,
          price,
          productSlug,
          "A trade was successfully completed against the property you are managing"
        );

        //admin/platform
        await tradeNotification(
          context,
          adminId, //admin id
          productTitle,
          units,
          price,
          productSlug
        );

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
      let { Ownership, ProductRate, Accounts, Catalog } = collections;
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

      console.log("product id is ", productId);

      if (!authToken || !userId) return new Error("Unauthorized");
      let decodedProductId = decodeOpaqueId(productId).id;

      const { _id: adminId } = await Accounts.findOne({
        "adminUIShopIds.0": { $ne: null, $exists: true },
      });

      const { product } = await Catalog.findOne({
        "product._id": decodedProductId,
      });

      if (product?.activeStatus === false || product?.isVisible === false) {
        return new Error("This property has been removed from the marketplace");
      }

      const productTitle = product?.title;
      const productSlug = product?.slug;

      //manager id for manager wallet adjustment
      const decodedManagerId = decodeOpaqueId(product?.manager).id;

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

          //manager wallet

          updateWallet(collections, decodedManagerId, buyerFee),

          //platform wallet
          updateWallet(collections, adminId, sellerFee),
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

          //buyer
          tradeNotification(
            context,
            decodedBuyerId,
            productTitle,
            units,
            price,
            productSlug,
            "Congratulations, you have successfully purchased this property"
          ),

          //seller
          tradeNotification(
            context,
            userId,
            productTitle,
            units,
            price,
            productSlug,
            "Congratulations!, your have successfully sold your property."
          ),

          //trustee
          tradeNotification(
            context,
            decodedManagerId,
            productTitle,
            units,
            price,
            productSlug,
            "A trade was successfully completed against the property you are managing"
          ),

          //admin/platform
          tradeNotification(
            context,
            adminId, //admin id
            productTitle,
            units,
            price,
            productSlug,
            "A trade was successfully completed"
          ),
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

      // meant for developer, in actuality, properties other than pre-market do not require voting
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
      const { voteType: oldVoteType } = await Votes.findOne({
        userId,
        productId,
      });

      if (
        (voteType !== "NONE" && oldVoteType === "UPVOTE") ||
        oldVoteType === "DOWNVOTE"
      ) {
        // If the new vote is UPVOTE or DOWNVOTE, set the existing vote to NONE
        update.$set.voteType = "NONE";
      }

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

      const originalTrade = await Trades.findOne({
        _id: ObjectID.ObjectId(tradeId),
      });

      console.log("original trade is ", originalTrade);

      const current = new Date();
      if (originalTrade.expirationTime < current) {
        return new Error("This offer has been expired");
      }
      if (originalTrade?.isCancelled === true) {
        return new Error("This trade has already been cancelled");
      }

      // const rates = await ProductRate.findOne({ productType: propertyType });

      let tradeType = originalTrade?.tradeType;
      let area = originalTrade?.area;
      let price = originalTrade?.price;
      let initial = area * price;

      let buyerFee = originalTrade?.buyerFee?.fee;
      let sellerFee = originalTrade?.sellerFee?.fee;
      let total = initial + buyerFee;

      let productId = originalTrade?.productId;

      console.log("seller Fee is ", sellerFee);

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

          await Accounts.updateOne(
            { _id: userId },
            {
              $inc: {
                "wallets.escrow": -sellerFee,
                "wallets.amount": sellerFee,
              },
            }
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

  //validate property active/deletion status
  //for buy trade:
  //if price new => validate user wallet => update price => update wallet

  // if quantity new => check max units of property => if(price) =>
  // check wallet against new price (else) check against old price => update wallet amount and escrow accordingly =>
  //  update quantity

  //if date new => check the date is not in the past => update date

  //for sell type trade:
  //if price new => update price
  //if quantity less than previous => transfer amount from unitEscrow to ownership
  //if quantity greater than previous => validate ownership => transfer units from ownerShip to unitEscrow
  //if date new => check the date is not in the past => update date
  //if price changes => update previous seller Fee
  async editTrade(parent, args, context, info) {
    try {
      const { authToken, userId, collections } = context;
      const { Trades, Ownership, Catalog, Accounts, ProductRate } = collections;

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

      // check if user is logged in
      if (!userId || !authToken)
        throw new ReactionError("access-denied", "Access Denied");

      let decodedProductId = decodeOpaqueId(productId).id;
      let decodedTradeId = decodeOpaqueId(args.tradeId).id;

      // product against which trade/offer is created
      const { product } = await Catalog.findOne({
        "product._id": decodedProductId,
      });

      //verify whether the product is active
      if (product?.activeStatus === false || product?.isVisible === false)
        return new Error(
          "This property have been removed from the marketplace"
        );

      //find original trade/offer
      let foundedTrade = await Trades.findOne({
        _id: ObjectID.ObjectId(decodedTradeId),
        createdBy: userId,
      });

      let { wallets } = await Accounts.findOne({
        _id: userId,
      });

      const originalWalletAmount = wallets.amount;
      const originalEscrowAmount = wallets.escrow;

      console.log("original wallet amount", originalWalletAmount);
      console.log("original escrow amount", originalEscrowAmount);

      let updatedFields = {};

      console.log("original trade  ", foundedTrade);

      console.log("new input values are ", args.input);

      // original trade values
      const originalPrice = parseFloat(foundedTrade.price);
      const originalArea = parseFloat(foundedTrade.area);
      const originalBuyerFeePercentage = foundedTrade.buyerFee.percentage;
      const originalSellerFeePercentage = foundedTrade.sellerFee.percentage;

      const originalSellerFeeValue = foundedTrade.sellerFee.fee;
      const originalBuyerFeeValue = foundedTrade.buyerFee.fee;

      const originalMinQty = foundedTrade.minQty;

      //find current buyer fee and seller fee percentage
      const { buyerFee, sellerFee } = await ProductRate.findOne({
        productType: product?.propertySaleType?.type,
      });

      if (minQty > area) {
        return new Error("Minimum Quantity cannot be more greater");
      }

      if (minQty !== originalMinQty) {
        updatedFields["minQty"] = minQty;
      }

      // edit trade for a buy offer (bid)
      if (foundedTrade?.tradeType === "bid") {
        console.log("trade type is bid");
        if (expirationTime) {
          updatedFields["expirationTime"] = expirationTime;
        }

        // checks if trade area exceeds total area of the property
        if (originalArea !== area) {
          console.log("original area check");
          const { area: propertyArea } = product;
          if (area > propertyArea?.value)
            return new Error(
              "You cannot purchase more than the total value of the property"
            );
          updatedFields["area"] = area;
        }

        let newAmount = price * area;
        let newPercentage = (newAmount / 100) * buyerFee;
        newAmount = newAmount + newPercentage;

        console.log("new amount 1", newAmount);

        let oldAmount = originalPrice * originalArea;

        let oldPercentage = (oldAmount / 100) * originalBuyerFeePercentage;
        oldAmount = oldAmount + oldPercentage;

        console.log("old amount 1", oldAmount);

        let amountChange = 0;
        let escrowChange = 0;
        const currentEscrow = originalPrice;

        // if the edited trade value is greater than the previous trade value
        if (newAmount > oldAmount) {
          //if the new amount is greater than the previous one, we will check whether the user has
          //sufficient funds to edit their offer

          console.log("new amount is greater than old one");
          amountChange = newAmount - oldAmount;
          escrowChange = amountChange;
          amountChange = -amountChange;

          console.log("new amount is ", newAmount);
          console.log("amount change is ", amountChange);
          console.log("escrow change is ", escrowChange);

          //checks the escrow change amount against the main wallet, in this scenario the escrow value is always positive
          await checkUserWallet(collections, userId, escrowChange);
        }

        // if the edited trade value is less than the previous trade value
        if (newAmount < oldAmount) {
          amountChange = oldAmount - newAmount;
          amountChange = +amountChange;
          escrowChange = -amountChange;
        }

        updatedFields["price"] = price;

        // update the user wallet and escrow based on new trade value
        await Accounts.updateOne(
          { _id: userId },
          {
            $inc: {
              "wallets.amount": amountChange,
              "wallets.escrow": escrowChange,
            },
          }
        );
      }

      // for sell offer/trade
      if (foundedTrade?.tradeType === "offer") {
        if (expirationTime) {
          updatedFields["expirationTime"] = expirationTime;
        }

        if (area !== originalArea) {
          if (area > product?.area?.value) {
            return new Error(
              "area cannot be greater than the total area of the property"
            );
          }
          updatedFields["area"] = area;
        }

        // if (area !== originalArea && area < originalArea) {
        //   console.log("condition 1");
        //   const { result } = await Ownership.updateOne(
        //     {
        //       productId: tradeType?.productId,
        //       ownerId: userId,
        //     },
        //     {
        //       $inc: { unitsEscrow: -area, amount: +area },
        //     }
        //   );
        //   console.log("result 1 ", result);
        //   if (result?.n > 0) {
        //     updatedFields["quantity"] = quantity;
        //   }
        // }

        // if (area !== originalArea && area > originalArea) {
        //   console.log("condition 2");
        //   //validate ownership
        //   const res = await Ownership.findOne({
        //     ownerId: userId,
        //     productId: foundedTrade?.productId,
        //   });

        //   const unitsEscrow = res?.unitsEscrow ? res?.unitsEscrow : 0;
        //   const ownedAmount = res?.amount + unitsEscrow;

        //   if (ownedAmount < area) {
        //     return new Error("You cannot sell more than what you own");
        //   }

        //   const { result } = await Ownership.updateOne(
        //     {
        //       productId: tradeType?.productId,
        //       ownerId: userId,
        //     },
        //     {
        //       $inc: { amount: +amount, unitsEscrow: -amount },
        //     }
        //   );
        //   console.log("result 2 ", result);
        //   if (result?.n > 0) {
        //     updatedFields["quantity"] = quantity;
        //   }
        // }

        if (price !== originalPrice) {
          // updated seller fee goes here
          const newPrice = area * price;
          let newFee = newPrice * (sellerFee / 100);
          let feeToUpdate = originalSellerFeeValue - newFee;
          let absoluteFee = Math.abs(feeToUpdate);

          await checkUserWallet(collections, userId, absoluteFee);

          console.log("absolute fee is ", absoluteFee);
          updatedFields["sellerFee.fee"] = absoluteFee;

          updatedFields["price"] = price;
        }
      }

      const { result } = await Trades.updateOne(
        {
          _id: ObjectID.ObjectId(decodedTradeId),
          createdBy: userId,
          completionStatus: { $ne: "completed" },
        },
        { $set: updatedFields }
      );

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
  async markAllAsRead(parent, args, context, info) {
    console.log("args");
    const { authToken, userId, collections } = context;
    console.log("auth token ", authToken, "user id is ", userId);

    console.log("collections are ", collections);
    const { Notifications } = collections;
    if (!authToken || !userId) return false;

    const { result } = await Notifications.updateMany(
      { to: userId },
      { $set: { status: "read" } }
    );

    return result?.n > 0;
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

      const { amount, productId, unitsEscrow } = await Ownership.findOne({
        _id: ObjectID.ObjectId(ownershipId),
      });

      // const { product } = await Catalog.findOne({
      //   "product._id": productId,
      // });

      if (unitsEscrow !== 0) {
        return new Error(
          "Cannot remove this user as owner, this user has already opened their units up for trading."
        );
      }

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

  // authenticate admin
  // calculate percentage total against ownership
  // calculate total amount for each owner(user)
  // check manager wallet for dividend award against total amount
  // update owners wallets
  // update trustee's wallet

  // async addDividend(parent, { input, isEdit }, context, info) {
  //   try {
  //     const { userId, authToken, collections } = context;
  //     const { Dividends, Accounts, Products, Catalog, Ownership } = collections;

  //     // if (!userId || !authToken) return new Error("Unauthorized");

  //     if (!authToken) {
  //       throw new ReactionError("server-error", "Bad Request");
  //     }

  //     // await context.validatePermissions(`reaction:legacy:accounts`, "create");

  //     const { dividendTo, amount, productId, dividendBy } = input;

  //     const decodedProductId = decodeOpaqueId(productId).id;

  //     const { manager: managerId, area } = await Products.findOne({
  //       _id: decodedProductId,
  //     });

  //     let decodedAccountIds = dividendTo?.map((id) => {
  //       return decodeOpaqueId(id).id;
  //     });

  //     const decodedManagerId = decodeOpaqueId(managerId).id;

  //     console.log("manager id is", decodedManagerId);

  //     let [totalAmount] = await Ownership.aggregate([
  //       {
  //         $match: {
  //           productId: decodedProductId,
  //           ownerId: { $in: decodedAccountIds }, // Use $nin to match documents where ownerId is not in the provided array
  //         },
  //       },
  //       { $group: { _id: "$productId", totalAmount: { $sum: "$amount" } } },
  //     ]).toArray();
  //     totalAmount = totalAmount?.totalAmount;

  //     // amount represents the percentage of the dividend to be provided against total ownership
  //     let amountToCheck = (totalAmount * amount) / 100;

  //     // console.log("amount to check is ", amountToCheck);

  //     // check whether the property is disabled or not
  //     const { product } = await Catalog.findOne({ "product._id": productId });
  //     if (!product?.isVisible)
  //       return new Error("This property has been disabled");

  //     await checkUserWallet(
  //       collections,
  //       decodedManagerId,
  //       amountToCheck,
  //       "The trustee does not have sufficient funds in their wallet to give this dividend, they need an additional"
  //     );

  //     let bulkOperations = dividendTo.map((item) => {
  //       let decodedUserId = decodeOpaqueId(item).id;

  //       return {
  //         updateOne: {
  //           filter: {
  //             dividendsTo: decodedUserId,
  //             productId: decodedProductId,
  //           },
  //           update: { $inc: { amount: amount } },
  //           upsert: true,
  //         },
  //       };
  //     });
  //     const messageHeader =
  //       "Congratulations, you have been awarded a Dividend ";
  //     const messageBody = `Dividend Amount: ${amount}`;

  //     if (isEdit) {
  //       messageHeader = "Your dividend amount has been updated";
  //       messageBody = "";
  //     }

  //     dividendTo?.map(async (item) => {
  //       let account = await Accounts?.findOne({
  //         _id: decodeOpaqueId(item).id,
  //       });

  //       await sendDividendNotification(
  //         context,
  //         account,
  //         messageHeader,
  //         messageBody
  //       );
  //     });

  //     const { result } = await Dividends.bulkWrite(bulkOperations);

  //     return result?.ok > 0;
  //   } catch (err) {
  //     return err;
  //   }
  // },

  //redundant
  // async addDividend(parent, { input }, context, info) {
  //   try {
  //     const { authToken, userId, collections } = context;

  //     if (!userId || !authToken) return new Error("Unauthorized");

  //     await context.validatePermissions(`reaction:legacy:accounts`, "create");

  //     const { Ownership, Catalog, Accounts, Dividends } = collections;
  //     const { dividendTo, productId, amount } = input;
  //     const decodedProductId = decodeOpaqueId(productId).id;

  //     let decodedOwnerIds = dividendTo.map((id) => {
  //       return decodeOpaqueId(id).id;
  //     });

  //     const { product } = await Catalog.findOne({
  //       "product._id": decodedProductId,
  //     });

  //     if (product?.isDisabled) {
  //       return new Error("This property is disabled");
  //     }

  //     const decodedManagerId = decodeOpaqueId(product?.manager).id;

  //     const totalPropertyValue = product.area.value;

  //     const ownersList = await Ownership.find({
  //       productId: decodedProductId,
  //       ownerId: { $in: decodedOwnerIds },
  //     }).toArray();

  //     let userSumMap = {};
  //     let totalPricing = ownersList?.map((owner) => {
  //       return owner?.ownershipHistory?.map((ownershipHistory, key) => {
  //         console.log("ownershipHistory", ownershipHistory);
  //         if (ownershipHistory?.tradeType === "buy") {
  //           const ownerKey = owner.ownerId; // ownerId as key for owner specific sum
  //           if (!userSumMap.hasOwnProperty(ownerKey)) {
  //             userSumMap[ownerKey] = 0; // null check
  //           }
  //           userSumMap[ownerKey] += ownershipHistory.price;
  //           return ownershipHistory.price;
  //         }
  //       });
  //     });

  //     let flattenedArray = totalPricing.flat();

  //     //finding the sum total of the amount paid by all owners.
  //     let totalSum = flattenedArray.reduce(
  //       (accumulator, currentValue) => accumulator + currentValue,
  //       0
  //     );
  //     let dividendAmount = (totalSum * amount) / 100;
  //     console.log("dividend amount is ", dividendAmount);

  //     await checkTrusteeWallet(collections, decodedManagerId, dividendAmount);
  //     console.log("user sum map is ", userSumMap);

  //     for (const ownerId in userSumMap) {
  //       if (userSumMap.hasOwnProperty(ownerId)) {
  //         const sum = (userSumMap[ownerId] * amount) / 100;

  //         await addDividendAmount(collections, ownerId, sum);
  //         console.log("inside loop");
  //         await Dividends.updateOne(
  //           {
  //             dividendTo: ownerId,
  //             productId: decodedProductId,
  //           },
  //           { $inc: { amount: sum } },
  //           { upsert: true }
  //         );
  //       }
  //     }
  //     const { result } = await Accounts.updateOne(
  //       {
  //         _id: decodedManagerId,
  //       },
  //       { $inc: { "wallets.amount": -dividendAmount } }
  //     );

  //     decodedOwnerIds?.map(async (item) => {
  //       let account = await Accounts?.findOne({
  //         _id: decodeOpaqueId(item).id,
  //       });

  //       const messageHeader = "Congratulations ";
  //       const messageBody = `You have been awarded a Dividend of ${amount}%`;
  //       await sendDividendNotification(
  //         context,
  //         account,
  //         messageHeader,
  //         messageBody
  //       );
  //     });

  //     return result?.n > 0;
  //   } catch (err) {
  //     return err;
  //   }
  // },

  // calculate ownership percentage for each owner against the total value of the property
  // validate manager/trustee wallet for total dividend to be awarded
  // award dividend
  async addDividend(parent, { input }, context, info) {
    try {
      const { authToken, userId, collections } = context;

      if (!userId || !authToken) return new Error("Unauthorized");

      await context.validatePermissions(`reaction:legacy:accounts`, "create");

      const { Ownership, Catalog, Accounts } = collections;
      const { dividendTo, productId, amount } = input;
      const decodedProductId = decodeOpaqueId(productId).id;

      let decodedOwnerIds = dividendTo.map((id) => {
        return decodeOpaqueId(id).id;
      });

      const { product } = await Catalog.findOne({
        "product._id": decodedProductId,
      });

      if (product?.isDisabled) {
        return new Error("This property is disabled");
      }

      //find manager name

      // property attributes
      const propertyTitle = product?.title;
      const slug = product?.slug;

      const decodedManagerId = decodeOpaqueId(product?.manager).id;

      let managerName = "";
      const { profile } = await Accounts.findOne({
        _id: decodedManagerId,
      });
      managerName = `${profile?.firstName} ${profile?.lastName}`;

      await checkTrusteeWallet(collections, decodedManagerId, amount);

      const totalPropertyValue = product.area.value;

      const ownersList = await Ownership.find({
        productId: decodedProductId,
        ownerId: { $in: decodedOwnerIds },
      }).toArray();

      //dividend amount to be payed, we will check the sum total for all owners and verify the manager/trustee's wallet
      let dividendAmount = amount;

      //we will calculate ownership percentage for each owner
      const percentageOwnership = ownersList?.map((owner, key) => {
        let value = owner?.amount / totalPropertyValue;
        return { ownerId: owner.ownerId, ownershipPercentage: value * 100 };
      });

      percentageOwnership.map(async (item, key) => {
        console.log(
          `dividend awarded is ${item.ownerId}`,
          (item.ownershipPercentage / 100) * amount
        );
        const value = (item.ownershipPercentage / 100) * amount;
        const roundedValue = value.toFixed(2);
        const messageHeader = "Congratulations ";
        const messageBody = `You have been awarded a Dividend of ${roundedValue}`;
        const description = "Congratulations! You have been awarded a dividend";

        await addDividendAmount(
          collections,
          item.ownerId,
          value,
          decodedProductId
        );
        await sendDividendNotification(
          context,
          item?.ownerId,
          managerName,
          messageHeader,
          messageBody,
          propertyTitle,
          roundedValue,
          description,
          slug
        );
        await Accounts.updateOne(
          {
            _id: decodedManagerId,
          },
          { $inc: { "wallets.amount": -dividendAmount } }
        );
      });

      //manager payout email to manager/trustee
      await sendDividendPayoutNotification(
        context,
        decodedManagerId,
        "Dividend Payout Successful",
        "Your Request for dividend payout has been completed",
        propertyTitle,
        amount,
        "Your Request for dividend payout has been completed",
        slug
      );

      return true;
    } catch (err) {
      return err;
    }
  },

  async sendPropertyEventNotification(parent, args, context, info) {
    try {
      const { productId, eventTitle, eventDetails } = args;
      const { collections } = context;
      const { Ownership, Catalog } = collections;
      const decodedProductId = decodeOpaqueId(productId).id;

      //find the product from catalog to fetch catalog details for email
      const { product } = await Catalog.findOne({
        "product._id": decodedProductId,
      });
      const productSlug = product?.slug;
      const propertyLink = `${process.env.CLIENT_URL}/product/${productSlug}`;

      //we will find the users who have subscribed to the property from Ownership collection
      const owners = await Ownership.find({
        productId: decodedProductId,
      }).toArray();

      console.log("all owners are ", owners);

      //we will map owners and send email and phone notifications to all the owners
      if (owners.length !== 0) {
        owners.map(async (owner, index) => {
          await propertyEventNotification(
            context,
            owner.ownerId,
            eventTitle,
            eventDetails,
            propertyLink
          );
        });
      }

      return true;
    } catch (err) {
      return err;
    }
  },

  async addUserDocuments(parent, { input }, context, info) {
    try {
      const { userId, authToken, collections } = context;

      const { UserDocuments } = collections;

      const { name, accountId, url, productId } = input;

      if (!userId || !authToken) return new Error("Unauthorized");

      await context.validatePermissions(`reaction:legacy:accounts`, "create");

      const decodedAccountId = decodeOpaqueId(accountId).id;

      let createdAt = new Date();
      let bulkOperations = url.map((item) => {
        return {
          insertOne: {
            name,
            accountId: decodedAccountId,
            url: item,
            createdAt,
            updatedAt: createdAt,
          },
        };
      });

      const { result } = await UserDocuments.bulkWrite(bulkOperations);

      return result?.ok > 0;
    } catch (err) {
      return err;
    }
  },
  async removeUserDocument(parent, { documentId }, context, info) {
    try {
      const { userId, authToken, collections } = context;
      const { UserDocuments } = collections;

      if (!userId || !authToken) return new Error("Unauthorized");

      await context.validatePermissions(`reaction:legacy:accounts`, "create");

      const { result } = await UserDocuments.deleteOne({
        _id: ObjectID.ObjectId(documentId),
      });

      return result?.n > 0;
    } catch (err) {
      return err;
    }
  },
  async generateSignedUrlTest(parent, { url }, context, info) {
    try {
      console.log("test generate Signed Url");
      return await generateSignedUrl(url);
    } catch (err) {
      return;
    }
  },
};
