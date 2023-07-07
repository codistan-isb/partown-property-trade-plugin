import getAccountById from "../util/getAccountById.js";
import getProductById from "../util/getProductById.js";
import getTradeById from "../util/getTradeById.js";
import _ from "lodash";

export default {
  async ownerInfo(parent, args, context, info) {
    let owner = await getAccountById(context, parent.ownerId);
    return owner;
  },
  async tradeInfo(parent, args, context, info) {
    let trade = await getTradeById(context, parent.tradeId);
    return trade;
  },
  async productDetails(parent, args, context, info) {
    let { product } = await getProductById(context, parent.productId);

    return { product: product };
  },
  async dividendReceived(parent, args, context, info) {
    console.log("parent in dividends received is ", parent);
    const { productId, ownerId } = parent;
    const { Dividends } = context.collections;

    const [dividendsReceived] = await Dividends.aggregate([
      {
        $match: { dividendTo: ownerId, productId },
      },
      {
        $group: {
          _id: null,
          dividendsReceived: {
            $sum: "$amount",
          },
        },
      },
    ]).toArray();

    console.log("");

    return dividendsReceived ? dividendsReceived?.dividendsReceived : 0;
  },
  async amountOwned(parent, args, context, info) {
    const { productId, ownerId } = parent;
    const { Catalog, Ownership } = context.collections;
    const { amount } = await Ownership.findOne({ ownerId, productId });
    const { product } = await Catalog.findOne({ "product._id": productId });
    const { area } = product;
    const totalArea = area?.value;
    // console.log("total area is ", totalArea);
    // console.log("area is", amount);
    return ((amount / totalArea) * 100).toFixed(2);
  },
  async totalRemaining(parent, args, context, info) {
    const { productId, ownerId } = parent;
    const { Catalog, Ownership } = context.collections;
    const { product } = await Catalog.findOne({ "product._id": productId });
    let [sum] = await Ownership.aggregate([
      {
        $match: {
          productId,
        },
      },
      { $group: { _id: "$productId", totalUnits: { $sum: "$amount" } } },
    ]).toArray();

    let totalOwned = sum?.totalUnits;

    const { area } = product;
    const totalValue = area?.value;
    const remaining = totalValue - totalOwned;
    console.log("test remaining", (remaining / totalValue) * 100);
    return ((remaining / totalValue) * 100).toFixed(2);
  },
};
