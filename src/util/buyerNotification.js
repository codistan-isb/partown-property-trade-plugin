import _ from "lodash";
import ReactionError from "@reactioncommerce/reaction-error";
import generateSignedUrl from "./signedUrls.js";

export default async function buyerNotification(
  context,
  userId,
  propertyTitle,
  units,
  fullName,
  buyerImage
) {
  const {
    collections: { Accounts, Shops },
  } = context;

  const bodyTemplate = "transaction/success";

  const account = await Accounts.findOne({ userId });

  if (!account) throw new ReactionError("not-found", "Account not found");

  // Account emails are always sent from the primary shop email and using primary shop
  // email templates.
  const shop = await Shops.findOne({ shopType: "primary" });
  if (!shop) throw new ReactionError("not-found", "Shop not found");

  let email = _.get(account, "emails[0].address");

  //   let firstName = _.get(account, "profile.firstName");
  //   let lastName = _.get(account, "profile.lastName");
  //   let buyerImage = _.get(account, "profile.picture");
  
  console.log("buyer image is ", buyerImage)
  const dataForEmail = {
    propertyTitle,
    buyerImage: await generateSignedUrl(buyerImage),

    contactEmail: _.get(shop, "emails[0].address"),
    buyerName: fullName,
    units,
  };

  const language =
    (account.profile && account.profile.language) || shop.language;

  return context.mutations.sendEmail(context, {
    data: dataForEmail,
    fromShop: shop,
    templateName: bodyTemplate,
    language,
    to: email,
  });
}
