"use client";

import { useState } from "react";

export default function Home() {
  const [count, setCount] = useState(0);

  return (
    <div
      style={{
        padding: 40,
        position: "relative",
        zIndex: 9999,
      }}
    >
      <h1>Test: {count}</h1>
      <button
        onClick={() => {
          console.log("clicked!", count + 1);
          setCount(count + 1);
        }}
        style={{
          padding: "10px 20px",
          fontSize: 18,
          cursor: "pointer",
        }}
      >
        Click me
      </button>
    </div>
  );
}
