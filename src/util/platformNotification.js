import _ from "lodash";
import ReactionError from "@reactioncommerce/reaction-error";

export default async function sendEmailOrPhoneNotification(context, userId) {
  const {
    collections: { Accounts, Shops },
    mutations: { startIdentityEmailVerification },
  } = context;

  const bodyTemplate = "trades/created";

  
  const account = await Accounts.findOne({ userId });

  console.log("account is ", account);

  if (!account) throw new ReactionError("not-found", "Account not found");

  // Account emails are always sent from the primary shop email and using primary shop
  // email templates.
  const shop = await Shops.findOne({ shopType: "primary" });
  if (!shop) throw new ReactionError("not-found", "Shop not found");

  console.log("shop is ", shop);

  console.log("account contact email is ", {
    contactEmail: _.get(account, "emails[0].address"),
  });
  let email = _.get(account, "emails[0].address");

  const dataForEmail = {
    // Reaction Information
    contactEmail: _.get(shop, "emails[0].address"),
    homepage: _.get(shop, "storefrontUrls.storefrontHomeUrl", null),
    copyrightDate: new Date().getFullYear(),
    legalName: _.get(shop, "addressBook[0].company"),
    physicalAddress: {
      address: `${_.get(shop, "addressBook[0].address1")} ${_.get(
        shop,
        "addressBook[0].address2"
      )}`,
      city: _.get(shop, "addressBook[0].city"),
      region: _.get(shop, "addressBook[0].region"),
      postal: _.get(shop, "addressBook[0].postal"),
    },
    shopName: shop.name,
    userEmailAddress: email,
  };

  const language =
    (account.profile && account.profile.language) || shop.language;

  return context.mutations.sendEmail(context, {
    data: dataForEmail,
    fromShop: shop,
    templateName: bodyTemplate,
    language,
    to: "irtaza780@gmail.com",
  });
}
