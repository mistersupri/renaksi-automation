import Hashids from "hashids";

export function encodeNRK(nrk, appname) {
  const hashids = new Hashids(Buffer.from(appname).toString("base64"), 5);

  const hex = Buffer.from(String(nrk)).toString("hex");

  return hashids.encodeHex(hex);
}
