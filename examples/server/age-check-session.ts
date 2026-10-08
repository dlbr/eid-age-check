import { DlbrId } from "@dlbr/eid-sdk";

const id = new DlbrId({
  baseUrl: process.env.DLBR_EID_BASE_URL ?? "https://api.dlbr.app",
  apiKey: process.env.DLBR_EID_API_KEY!,
});

const issuerId = process.env.DLBR_EID_AGE_ISSUER_ID!;

/** Creates a minimum-disclosure Proof of Age session on the server. */
export async function createAgeCheckSession() {
  const session = await id.sessions.create({
    credentials: [{
      id: "proof-of-age",
      format: "mso_mdoc",
      issuer_id: issuerId,
      trust_domain: "pub_eaa",
      namespace: "eu.europa.ec.av.1",
      doc_type: "eu.europa.ec.av.1",
      claims: ["age_over_18"],
    }],
  });

  // Store session.session_id against the current site session before returning.
  // Do not return the Gateway API key or raw credential claims to the browser.
  return {
    session_id: session.session_id,
    qr_code_url: session.qr_code_url,
    expires_at: session.expires_at,
  };
}

/** Maps a server-retrieved Gateway result to the widget's small status contract. */
export async function readAgeCheckResult(sessionId: string) {
  const session = await id.sessions.get(sessionId);
  if (session.status === "FAILED" || session.status === "EXPIRED") {
    return { status: session.status };
  }
  if (session.status !== "VERIFIED") return { status: "PENDING" };

  const credential = session.claims?.["proof-of-age"] as
    | Record<string, unknown>
    | undefined;
  const namespace = credential?.["eu.europa.ec.av.1"] as
    | Record<string, unknown>
    | undefined;
  const ageOver18 = namespace?.age_over_18;
  if (typeof ageOver18 !== "boolean") {
    return { status: "FAILED" };
  }
  return { status: "VERIFIED", age_over_18: ageOver18 };
}
