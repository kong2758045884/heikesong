import { init, use } from "echarts/core";
import { BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  AriaComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
use([BarChart, GridComponent, TooltipComponent, AriaComponent, SVGRenderer]);
export function mountBars(el, labels, series, max) {
  const chart = init(el, null, { renderer: "svg" }),
    narrow = el.clientWidth < 500;
  chart.setOption({
    animation: !matchMedia("(prefers-reduced-motion: reduce)").matches,
    aria: { enabled: true },
    color: ["#304ab6", "#ea865c", "#659a9e"],
    textStyle: { fontFamily: "system-ui, sans-serif" },
    tooltip: { trigger: "axis", renderMode: "richText" },
    grid: { left: 42, right: 24, top: 24, bottom: narrow ? 48 : 34 },
    xAxis: {
      type: "category",
      data: labels,
      axisTick: { show: false },
      axisLabel: {
        interval: 0,
        rotate: narrow && labels.length > 3 ? 18 : 0,
        overflow: "truncate",
        width: narrow ? 64 : 120,
      },
    },
    yAxis: {
      type: "value",
      min: 0,
      minInterval: 1,
      ...(max ? { max } : {}),
      splitLine: { lineStyle: { color: "#dbdcd7", type: "dashed" } },
    },
    series: series.map(({ name, data }) => ({
      type: "bar",
      name,
      data,
      barMaxWidth: 36,
      itemStyle: { borderRadius: [3, 3, 0, 0] },
    })),
  });
  const observer = new ResizeObserver(() => {
    if (el.clientWidth) chart.resize();
  });
  observer.observe(el);
  return () => {
    observer.disconnect();
    chart.dispose();
  };
}
