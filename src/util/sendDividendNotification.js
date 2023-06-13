import _ from "lodash";

async function sendDividendEmail(context, email, messageHeader, messageBody) {
  const { Shops } = context.collections;
  const bodyTemplate = "generic/template";

  const shop = await Shops.findOne({ shopType: "primary" });
  if (!shop) throw new ReactionError("not-found", "Shop not found");

  console.log("sending dividend Email", email);

  const dataForEmail = {
    messageHeader,
    messageBody,
    website: "https://dev.partown.co/",
    email: "dev@partown.co",
    linkedIn: "https://linkedin.com/",
  };

  const language = shop.language;

  return context.mutations.sendEmail(context, {
    data: dataForEmail,
    fromShop: shop,
    templateName: bodyTemplate,
    language,
    to: email,
  });
}

export default async function sendDividendNotification(
  context,
  account,
  messageHeader,
  messageBody
) {
  //account information

  let email = _.get(account, "emails[0].address");

  console.log("email is***** ", email);

  //   let profileImage = _.get(account, "profile.picture");

  const hasEnabledEmailNotification = _.get(
    account,
    "userPreferences.contactPreferences.email"
  );
  const hasEnabledSMSNotification = _.get(
    account,
    "userPreferences.contactPreferences.sms"
  );

  console.log(
    "notification check enabled",
    hasEnabledEmailNotification,
    hasEnabledSMSNotification
  );

  if (hasEnabledEmailNotification) {
    await sendDividendEmail(context, email, messageHeader, messageBody);
  }
  if (hasEnabledSMSNotification) {
    console.log("*******sending phone notification dividend**********");
  }
  return true;
}
