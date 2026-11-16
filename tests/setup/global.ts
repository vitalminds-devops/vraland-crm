import { verifyDatabase } from "../helpers/environment";
export default async function setup() {
  await verifyDatabase();
}
