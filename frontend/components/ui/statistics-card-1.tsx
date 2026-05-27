import { cn } from "@/lib/utils";
import { useState } from "react";

export const StatisticsCard1 = () => {
  const [count, setCount] = useState(0);

  return (
    <div className={cn("flex flex-col items-center gap-4 p-4 rounded-lg border")}>
      <h1 className="text-2xl font-bold mb-2">Component Example</h1>
      <h2 className="text-xl font-semibold">{count}</h2>
      <div className="flex gap-2">
        <button className="px-3 py-1 bg-muted rounded" onClick={() => setCount((prev) => prev - 1)}>-</button>
        <button className="px-3 py-1 bg-muted rounded" onClick={() => setCount((prev) => prev + 1)}>+</button>
      </div>
    </div>
  );
};
