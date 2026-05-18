import type { Request } from 'express';
import { addMonths, startOfMonth, parseISO, isValid } from 'date-fns';

/**
 * Shared helpers for analytics controllers/services.
 *
 * Extracted as part of C-04 to break up the analytics god-object.
 *
 * NOTE: `parsePeriodFromRequest` preserves FIX-01/02 semantics — the
 * end date is exclusive (start of next month) so queries with `lte: endDate`
 * include the full final day of the period.
 */

export interface PeriodRange {
    startDate: Date;
    endDate: Date;
}

/**
 * Parse a `?period=YYYY-MM` query parameter into a [startDate, endDate) range.
 * Falls back to the current month if the parameter is missing or invalid.
 *
 * The range is half-open: endDate = startOfMonth(period) + 1 month. This was
 * the contract established when the heatmap/abc/supplier endpoints were
 * migrated off `endOfMonth()` in FIX-01/02 to avoid off-by-one losses on the
 * final day.
 */
export function parsePeriodFromRequest(req: Request): PeriodRange {
    const period = req.query.period as string | undefined;

    if (period && isValid(parseISO(period))) {
        const date = parseISO(period);
        const startDate = startOfMonth(date);
        return { startDate, endDate: addMonths(startDate, 1) };
    }

    const now = new Date();
    const startDate = startOfMonth(now);
    return { startDate, endDate: addMonths(startDate, 1) };
}
