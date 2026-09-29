export {
  createAgeCheckElementClass,
  registerAgeCheckElement,
} from "./age-check-element.js";
export {
  AgeCheckProtocolError,
  createSessionUrl,
  createStatusUrl,
  parseAgeCheckSessionResponse,
  parseCreateSessionResponse,
  resolveEndpoint,
  validateWalletRequestUrl,
  type AgeCheckSessionResponse,
  type AgeCheckStatus,
  type CreateAgeCheckSessionResponse,
} from "./protocol.js";
