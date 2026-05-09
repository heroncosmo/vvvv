import assert from "node:assert/strict";

import {
  isSimpleGreetingMessage,
  prependContextualOpeningInstruction,
  shouldForceContextualOpeningResponse,
  shouldReturnOpeningOnlyResponse,
} from "../initialOpeningReplyPolicy";

assert.equal(isSimpleGreetingMessage("oi"), true);
assert.equal(isSimpleGreetingMessage("Boa tarde!"), true);
assert.equal(isSimpleGreetingMessage("voce tem kit lencol e fronha casal"), false);

assert.equal(
  shouldReturnOpeningOnlyResponse({
    openingRuleSource: "greeting",
    customerMessage: "oi",
  }),
  true,
);

assert.equal(
  shouldReturnOpeningOnlyResponse({
    openingRuleSource: "greeting",
    customerMessage: "voce tem kit lencol e fronha casal",
  }),
  false,
);

assert.equal(
  shouldReturnOpeningOnlyResponse({
    openingRuleSource: "greeting",
    customerMessage: "bom dia\n\ntem painel hulk",
  }),
  false,
);

assert.equal(
  shouldReturnOpeningOnlyResponse({
    openingRuleSource: "off_hours",
    customerMessage: "",
  }),
  true,
);

assert.equal(shouldForceContextualOpeningResponse("oi"), false);
assert.equal(
  shouldForceContextualOpeningResponse("voce tem kit lencol e fronha casal"),
  true,
);
assert.equal(shouldForceContextualOpeningResponse("boa noite\n\ntem painel hulk"), true);

assert.equal(
  prependContextualOpeningInstruction({
    customerMessage: "oi",
    baseUserMessage: "oi",
  }),
  "oi",
);

const contextualOpeningInstruction = prependContextualOpeningInstruction({
  customerMessage: "voce tem kit lencol e fronha casal",
  baseUserMessage: "voce tem kit lencol e fronha casal",
});

assert.equal(
  contextualOpeningInstruction.includes("Nao envie apenas a midia sem texto."),
  true,
);
assert.equal(
  contextualOpeningInstruction.endsWith("voce tem kit lencol e fronha casal"),
  true,
);

console.log("initialOpeningReplyPolicy.test.ts ok");
