import { connectToDatabase } from "@/lib/db/connect";
import { HsnSacCode } from "@/lib/db/models/HsnSacCode";

/**
 * Batch lookup of official HSN/SAC descriptions, used by the GSTR-1 JSON export's hsn_b2b/
 * hsn_b2c `desc` field (lib/gst/gstr1JsonExport.ts via computeGstr1) so the filed description
 * matches the government's own classification rather than whatever free-text a product/line
 * item happened to use. Not businessId-scoped — see HsnSacCode.ts's doc comment for why this
 * collection is shared reference data, not tenant data.
 */
export async function lookupHsnSacDescriptions(codes: string[]): Promise<Map<string, string>> {
  await connectToDatabase();
  const uniqueCodes = [...new Set(codes.filter((c): c is string => !!c))];
  if (uniqueCodes.length === 0) return new Map();
  const docs = await HsnSacCode.find({ code: { $in: uniqueCodes } }).select("code description").lean();
  return new Map(docs.map((d) => [d.code, d.description]));
}
