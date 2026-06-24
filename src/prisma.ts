import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
  log: ["warn", "error"],
});

// BigInt'larni JSON.stringify qila olish uchun (backup uchun foydali)
// @ts-expect-error — global BigInt prototype
BigInt.prototype.toJSON = function () {
  return this.toString();
};
