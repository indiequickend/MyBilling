import { z } from "zod";
import { optionalTrimmed, optionalFormatted } from "@/lib/validation/shared";
import {
  EWAY_BILL_TRANS_MODES,
  EWAY_BILL_VEHICLE_TYPES,
  EWAY_BILL_SUB_SUPPLY_TYPES,
} from "@/lib/db/models/EwayBillData";

/** GST return periods are always calendar months ("YYYY-MM"), never a fiscal year — shared by
 * GSTR-1/3B/2B period pickers and the filing tracker. */
export const gstPeriodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Select a valid month");

const TRANSPORTER_ID_REGEX = /^[0-9A-Z]{15}$/;

export const transportDetailsSchema = z.object({
  transporterId: optionalFormatted(
    z.string().trim().toUpperCase().regex(TRANSPORTER_ID_REGEX, "Enter a valid 15-character transporter ID"),
  ),
  transporterName: optionalTrimmed(200),
  transDocNo: optionalTrimmed(50),
  transDocDate: optionalTrimmed(30),
  transMode: z.enum(EWAY_BILL_TRANS_MODES),
  transDistanceKm: z.coerce.number().min(0).max(4000).optional(),
  vehicleNumber: optionalTrimmed(20),
  vehicleType: z.enum(EWAY_BILL_VEHICLE_TYPES),
  subSupplyType: z.enum(EWAY_BILL_SUB_SUPPLY_TYPES),
});
export type TransportDetailsInput = z.infer<typeof transportDetailsSchema>;

export const markGstr1FiledSchema = z.object({
  period: gstPeriodSchema,
});

export const gstr2bImportSchema = z.object({
  period: gstPeriodSchema,
});

export const eInvoiceStatusOverrideSchema = z.object({
  status: z.enum(["cancelled", "pending"]),
});
