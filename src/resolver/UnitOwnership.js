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
        $match: { dividendsTo: ownerId, productId },
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

    return dividendsReceived ? dividendsReceived?.dividendsReceived : 0;
  },
};
