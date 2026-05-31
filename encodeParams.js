import Hashids from "hashids";
import dotenv from "dotenv";

dotenv.config();

const APP_NAME = process.env.APP_NAME;

const hashids = new Hashids(Buffer.from(APP_NAME).toString("base64"), 5);

export const encodeParams = (value) => {
  const hex = Buffer.from(String(value)).toString("hex");

  return hashids.encodeHex(hex);
};
