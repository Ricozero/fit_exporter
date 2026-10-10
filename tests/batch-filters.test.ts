import { describe, expect, it } from "vitest";
import { parseWorkoutFilters } from "../src/batch-filters";

describe("workout filters", () => {
  it("omits all filters", () => {
    expect(parseWorkoutFilters("全部", "全部", "全部").filters).toEqual({});
  });

  it.each([
    ["其他", 0], ["徒步", 1], ["跑步", 2], ["骑行", 3], ["游泳", 5],
    ["滑雪", 6], ["训练", 8], ["室内骑行", 11], ["虚拟骑行", 12],
  ])("maps %s to sport %i", (name, id) => {
    expect(parseWorkoutFilters(String(name), "2026", "12月").filters).toEqual({ sport: id, year: 2026, month: 12 });
  });

  it("omits the month when no year is selected", () => {
    expect(parseWorkoutFilters("全部", "全部", "1月").filters).toEqual({});
  });

  it("accepts a year with all months", () => {
    expect(parseWorkoutFilters("全部", "2026", "全部").filters).toEqual({ year: 2026 });
  });

  it.each([
    ["未知运动", "全部", "全部"], ["全部", "明年", "全部"],
    ["全部", "2026", "0月"], ["全部", "2026", "13月"],
  ])("rejects invalid filters: %s %s %s", (sport, year, month) => {
    expect(() => parseWorkoutFilters(sport, year, month)).toThrow();
  });
});
