import type { WorkoutFilters } from "./types";

const SPORT_IDS: Record<string, number> = {
  "其他": 0, "徒步": 1, "跑步": 2, "骑行": 3, "游泳": 5,
  "滑雪": 6, "自由行": 7, "训练": 8, "室内训练": 8,
  "室内骑行": 11, "虚拟骑行": 12,
};

export interface SelectedFilters {
  filters: WorkoutFilters;
  description: string;
}

export function parseWorkoutFilters(sport: string, year: string, month: string): SelectedFilters {
  const filters: WorkoutFilters = {};
  if (sport !== "全部") {
    if (!Object.hasOwn(SPORT_IDS, sport)) throw new Error(`无法识别运动类型：${sport}`);
    filters.sport = SPORT_IDS[sport];
  }
  if (year !== "全部") {
    if (!/^\d{4}$/.test(year) || Number(year) === 0) throw new Error(`无法识别年份：${year}`);
    filters.year = Number(year);
    if (month !== "全部") {
      if (!/^(?:[1-9]|1[0-2])月$/.test(month)) throw new Error(`无法识别月份：${month}`);
      filters.month = Number(month.slice(0, -1));
    }
  }
  return { filters, description: `${sport} · ${year === "全部" ? "全部年份" : `${year}年`} · ${filters.month === undefined ? "全部月份" : month}` };
}

export function readWorkoutFilters(root: ParentNode = document): SelectedFilters {
  const read = (name: string): string => {
    const column = Array.from(root.querySelectorAll(".filter_col")).find(
      (item) => item.querySelector(".filter_label")?.textContent?.trim() === name,
    );
    const value = column?.querySelector(".display .tip")?.textContent?.trim();
    if (!value) throw new Error(`无法读取${name}筛选`);
    return value;
  };
  return parseWorkoutFilters(read("运动类型"), read("年份"), read("月份"));
}
