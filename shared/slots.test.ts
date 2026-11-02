import { describe, expect, it } from "vitest";
import { computeSlots, conflictAt, freeMinutesFrom, type DayInput } from "./slots";
import { addDays, fmtMin, minutesUntil, nowInZone, weekdayOf } from "./time";
import { toE164, fmtPhone, splitE164 } from "./phone";

const h = (s: string) => {
  const [hh, mm] = s.split(":").map(Number);
  return hh * 60 + mm;
};

const day = (over: Partial<DayInput> = {}): DayInput => ({
  hours: { open: h("10:00"), close: h("22:00") },
  breaks: [{ start: h("14:00"), end: h("15:00") }],
  timeOff: [],
  bookings: [],
  bufferMin: 5,
  stepMin: 30,
  ...over,
});

const starts = (input: DayInput, dur: number, onlyAvailable = true) =>
  computeSlots(input, dur)
    .filter((s) => !onlyAvailable || s.available)
    .map((s) => fmtMin(s.start));

describe("computeSlots", () => {
  it("offers every step from opening and leaves out the break", () => {
    const s = starts(day(), 30);
    expect(s[0]).toBe("10:00");
    expect(s).toContain("13:30");
    expect(s).not.toContain("14:00");
    expect(s).not.toContain("14:30");
    expect(s).toContain("15:00");
    expect(s.at(-1)).toBe("21:30");
  });

  it("only offers starts where the whole visit fits before a break and before closing", () => {
    const s = starts(day(), 60);
    expect(s).toContain("13:00");
    expect(s).not.toContain("13:30"); // would run into the 14:00 break
    expect(s.at(-1)).toBe("21:00");
  });

  it("returns nothing on a closed day", () => {
    expect(computeSlots(day({ hours: null }), 30)).toEqual([]);
  });

  it("marks starts taken by a booking (plus buffer) as unavailable", () => {
    const input = day({ bookings: [{ start: h("11:00"), duration: 30 }] });
    const all = computeSlots(input, 30);
    const at = (t: string) => all.find((x) => x.start === h(t));
    // 10:30 + 30 + 5 buffer = 11:05 > 11:00 -> clash
    expect(at("10:30")?.available).toBe(false);
    expect(at("11:00")?.available).toBe(false);
    // 11:30 starts after 11:00 + 30 + 5 = 11:35? No: 11:30 < 11:35 -> clash
    expect(at("11:30")?.available).toBe(false);
    expect(at("12:00")?.available).toBe(true);
    expect(at("10:00")?.available).toBe(true);
  });

  it("offers the exact time right after a booking plus buffer", () => {
    const input = day({ bookings: [{ start: h("11:00"), duration: 30 }] });
    const s = starts(input, 30);
    expect(s).toContain("11:35"); // 11:00 + 30 + 5 buffer
    expect(s).not.toContain("11:30");
    // only once, and in time order
    expect(s.filter((x) => x === "11:35")).toHaveLength(1);
    expect(s.indexOf("11:35")).toBe(s.indexOf("12:00") - 1);
  });

  it("doesn't add the after-booking time when the visit wouldn't fit", () => {
    // 13:35 + 30 min runs into the 14:00 lunch break
    const input = day({ bookings: [{ start: h("13:00"), duration: 30 }] });
    expect(starts(input, 30)).not.toContain("13:35");
    expect(starts(input, 20)).toContain("13:35");
  });

  it("offers the time right after time off ends, rounded to 5 minutes", () => {
    const input = day({ timeOff: [{ start: h("17:00"), end: h("17:12") }] });
    expect(starts(input, 30)).toContain("17:15");
  });

  it("with zero buffer, back-to-back visits are allowed", () => {
    const input = day({ bufferMin: 0, bookings: [{ start: h("11:00"), duration: 30 }] });
    const s = starts(input, 30);
    expect(s).toContain("10:30");
    expect(s).toContain("11:30");
    expect(s).not.toContain("11:00");
  });

  it("respects time off and quick breaks", () => {
    const input = day({ timeOff: [{ start: h("18:00"), end: h("19:00") }] });
    const s = starts(input, 30);
    expect(s).not.toContain("18:00");
    expect(s).not.toContain("18:30");
    expect(s).toContain("19:00");
  });

  it("leaves out starts before earliestStart (today)", () => {
    const s = starts(day({ earliestStart: h("16:10") }), 30);
    expect(s[0]).toBe("16:30");
  });

  it("Friday afternoon-only hours", () => {
    const s = starts(day({ hours: { open: h("16:00"), close: h("22:00") } }), 30);
    expect(s[0]).toBe("16:00");
  });

  it("long services need a long enough gap", () => {
    const input = day({ bookings: [{ start: h("12:00"), duration: 30 }] });
    const s = starts(input, 90);
    expect(s).toContain("10:00"); // 10:00-11:30 (+5) ends before 12:00
    expect(s).not.toContain("10:30"); // 10:30-12:00 (+5) runs into 12:00
    expect(s).not.toContain("12:30"); // the 12:00 visit plus buffer runs until 12:35
    expect(s).not.toContain("13:00"); // runs into the break
  });
});

describe("conflictAt", () => {
  it("explains why a time can't be used", () => {
    const input = day({ bookings: [{ start: h("11:00"), duration: 30 }] });
    expect(conflictAt(input, h("09:30"), 30)).toBe("outside_hours");
    expect(conflictAt(input, h("14:00"), 30)).toBe("break");
    expect(conflictAt(input, h("11:00"), 30)).toBe("booked");
    expect(conflictAt(input, h("12:00"), 30)).toBeNull();
    expect(conflictAt({ ...input, hours: null }, h("12:00"), 30)).toBe("closed");
  });

  it("can ignore opening hours (walk-ins after closing)", () => {
    expect(conflictAt(day(), h("22:10"), 30, { ignoreHours: true })).toBeNull();
  });
});

describe("freeMinutesFrom", () => {
  it("counts minutes until the next booking minus the buffer", () => {
    const input = day({ bookings: [{ start: h("11:15"), duration: 30 }] });
    expect(freeMinutesFrom(input, h("10:40"))).toBe(30); // 11:15 - 5 buffer - 10:40
  });
  it("is zero while a visit is running", () => {
    const input = day({ bookings: [{ start: h("10:30"), duration: 30 }] });
    expect(freeMinutesFrom(input, h("10:45"))).toBe(0);
  });
  it("stops at a break", () => {
    expect(freeMinutesFrom(day(), h("13:20"))).toBe(40);
  });
});

describe("time helpers", () => {
  it("weekdays and dates", () => {
    expect(weekdayOf("2026-10-30")).toBe(5); // Friday
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(minutesUntil({ date: "2026-10-29", min: h("23:00") }, "2026-10-30", h("01:00"))).toBe(120);
  });
  it("now in Qatar time", () => {
    const n = nowInZone("Asia/Qatar", new Date("2026-10-29T21:30:00Z"));
    expect(n).toEqual({ date: "2026-10-30", min: h("00:30") });
  });
});

describe("phone numbers", () => {
  it("normalizes to E.164", () => {
    expect(toE164("974", "5512 3456")).toBe("+97455123456");
    expect(toE164("91", "098470 12345")).toBe("+919847012345");
    expect(toE164("974", "+91 98470 12345")).toBe("+919847012345");
    expect(toE164("974", "123")).toBeNull();
  });
  it("splits and formats", () => {
    expect(splitE164("+97455123456")).toEqual({ dial: "974", local: "55123456" });
    expect(fmtPhone("+97455123456")).toBe("+974 5512 3456");
    expect(fmtPhone("+919847012345")).toBe("+91 98470 12345");
  });
});
