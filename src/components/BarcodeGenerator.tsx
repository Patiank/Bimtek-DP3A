import React from "react";

interface BarcodeProps {
  value: string;
  className?: string;
  height?: number;
  width?: number;
}

export const BarcodeGenerator: React.FC<BarcodeProps> = ({
  value = "1371012105950002",
  className = "",
  height = 50,
}) => {
  // Simple robust Code 39-ish/Interleaved encoding dictionary for digits 0-9
  const digitPatterns: { [key: string]: string } = {
    "0": "1001110110101",
    "1": "1101001010111",
    "2": "1011001010111",
    "3": "1101100101011",
    "4": "1010011010111",
    "5": "1101001101011",
    "6": "1011001101011",
    "7": "1010010110111",
    "8": "1101001011011",
    "9": "1011001011011",
  };

  const startPattern = "1010";
  const endPattern = "1010";

  // Filter out non-numeric characters for safe processing
  const cleanValue = value.replace(/\D/g, "") || "1234567890";
  
  // Build the complete binary sequence
  let binarySequence = startPattern;
  for (let i = 0; i < cleanValue.length; i++) {
    const digit = cleanValue[i];
    binarySequence += digitPatterns[digit] || "10101";
  }
  binarySequence += endPattern;

  const totalBits = binarySequence.length;

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <svg
        viewBox={`0 0 ${totalBits} 50`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        style={{ color: "#111827", fill: "#111827" }}
      >
        {binarySequence.split("").map((bit, idx) => {
          if (bit === "1") {
            return (
              <rect
                key={idx}
                x={idx}
                y={0}
                width={1}
                height={50}
                style={{ fill: "#111827" }}
              />
            );
          }
          return null;
        })}
      </svg>
      <span className="text-[10px] sm:text-[11px] font-mono tracking-widest mt-1" style={{ color: "#374151" }}>
        *{cleanValue.substring(0, 4)} - {cleanValue.substring(4, 10)} - {cleanValue.substring(10)}*
      </span>
    </div>
  );
};
