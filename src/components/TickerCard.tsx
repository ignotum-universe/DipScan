// src/components/TickerCard.tsx
import React, { useState } from 'react';
import ClientOnlyChart from './ClientOnlyChart';

import { STATUS_MATRIX, getZScoreBadge, variantBorderClasses, variantTextClasses, getZScoreExplained, getCardStyles } from '../data/statusVerdicts';

interface ChartDataPoint {
  trading_date: string;
  close_price: number;
  open_price: number;
  high_price: number;
  low_price: number;
  volume: number;
  sma200: number | null;
  rollingVwap: number | null;
}

interface VolumeProfileBin {
  priceBin: number;
  volume: number;
}

interface VPVRData {
  bins: VolumeProfileBin[];
  poc: { price: number; volume: number };
  highVolumeNodes: VolumeProfileBin[];
  lowestNode?: number;
  highestNode?: number;
}

interface VolatilityGuard {
  currentAtr: number | null;
  atrRatio: number;
  isCompressed: boolean;
}

interface TickerCardProps {
  ticker: string;
  data: {
    chartData: ChartDataPoint[];
    volumeProfile: VPVRData; // 50-day tactical data
    anchorProfile: VPVRData; // 200-day macro anchor data!
    volatilityGuard: VolatilityGuard;
  };
}

function calculateCurrentVWAPZScore(prices: number[], vwapWindow: (number | null)[], period: number = 20): number {
  if (prices.length < period || vwapWindow.length < period) return 0;

  const priceSample = prices.slice(0, period);
  // Safely filter out any null values from the rolling VWAP window
  const vwapSample = vwapWindow.slice(0, period).filter((v): v is number => v !== null);

  const minRequired = Math.floor(period / 2);
  if (vwapSample.length < minRequired) return 0;

  // Use the actual current 20-period Rolling VWAP as our anchor mean
  const currentVwapMean = vwapSample[0];

  // Calculate variance relative to the VWAP mean line
  const variance = priceSample.reduce((sum, val) => sum + Math.pow(val - currentVwapMean, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  return stdDev === 0 ? 0 : (prices[0] - currentVwapMean) / stdDev;
}

//Check the last 10 days, if 4 out of the 10 at the bottom of 200SMA range, promote status to value trap
function checkStructuralDecay(chartData: any[], lowestAnchorNode: number): { isDecaying: boolean; densityPct: number } {
  if (!chartData || chartData.length < 10 || lowestAnchorNode === 0) {
    return { isDecaying: false, densityPct: 0 };
  }

  let floorDayCount = 0;
  const lookbackPeriod = 10;

  // Scan the trailing 10 sessions (index 0 is today, index 9 is two weeks ago)
  for (let i = 0; i < lookbackPeriod; i++) {
    // If close price is under the floor, or within a tight 2% friction zone of it
    if (chartData[i].close_price <= lowestAnchorNode * 1.02) {
      floorDayCount++;
    }
  }

  const densityPct = (floorDayCount / lookbackPeriod) * 100;

  // TRIPWIRE: If the asset spends 40% or more of its last 10 days heavy at the floor, 
  // it is structurally decaying. Weak 1-day bounces will NOT clear this flag.
  return {
    isDecaying: densityPct >= 40,
    densityPct
  };
}

function calculateMomentumZScore(prices: number[], period: number = 20): number {
  if (prices.length < period) return 0;

  const sample = prices.slice(0, period);
  const mean = sample.reduce((a, b) => a + b, 0) / period;
  const variance = sample.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  return stdDev === 0 ? 0 : (prices[0] - mean) / stdDev;
}

export default function TickerCard({ ticker, data }: TickerCardProps) {
  const { anchorProfile } = data;
  const { volatilityGuard } = data;
  const [showModal, setShowModal] = useState(false);

  if (!data || !data.chartData || data.chartData.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500 font-medium bg-gray-50 rounded-xl border border-gray-200 shadow-sm animate-pulse">
        Loading {ticker}...
      </div>
    );
  }

  const chartData = data.chartData;
  const latest = chartData[0];
  const latestPrice = latest.close_price;

  const previous = chartData[1];
  const previousPrice = previous ? previous.close_price : latestPrice;

  const isAbove200SMA = latest.sma200 ? latestPrice > latest.sma200 : false;
  const allClosePrices = chartData.map(d => d.close_price);
  const allRollingVwaps = chartData.map(d => d.rollingVwap);
  const currentZScore = calculateCurrentVWAPZScore(allClosePrices, allRollingVwaps, 20);
  const momentumZScore = calculateMomentumZScore(allClosePrices, 20);
  const zScore = momentumZScore;

  const vpvr = data.volumeProfile;
  const pocPrice = vpvr?.poc?.price || 0;
  const topNodes = vpvr?.highVolumeNodes || [];

  const lowestAnchorNode = anchorProfile?.lowestNode || 0;
  const highestAnchorNode = anchorProfile?.highestNode || 0;
  const { isDecaying, densityPct } = checkStructuralDecay(chartData, lowestAnchorNode);

  let inPriceDiscovery = false;
  let discoveryType: 'UPWARD' | 'DOWNWARD' | null = null;
  const downwardBuffer = 0.98;
  const upwardBuffer = 1.02;
  // 1. Define a "Momentum Regime" based on your Z-Score
  const isTrendingUp = zScore > 0.5; // Moving significantly above the mean
  const isCrashing = zScore < -1.0;  // Momentum has inverted
  const localPeak = Math.max(...chartData.slice(0, 5).map(d => d.high_price));

  // 2. Define a "Correction Threshold" (e.g., if price is 10% below its 5-day peak)
  const isCorrecting = latestPrice < (localPeak * 0.90);

  // 3. Update the Gatekeeper
  if (isCorrecting) {
    // If we've dropped 10% from the recent peak, we are NOT in discovery
    inPriceDiscovery = false;
    discoveryType = null;
  } else if (lowestAnchorNode > 0 && latestPrice < lowestAnchorNode * downwardBuffer) {
    inPriceDiscovery = true;
    discoveryType = 'DOWNWARD';
  } else if (highestAnchorNode > 0 && latestPrice > highestAnchorNode * upwardBuffer && isTrendingUp && !isCrashing) {
    inPriceDiscovery = true;
    discoveryType = 'UPWARD';
  }

  const getStatus = (isAbove200SMA: boolean, zScore: number): string => {
    if (latest.sma200 === null || latest.sma200 === undefined) {
      return "Insufficient Data (Recent IPO / Low History)";
    }

    const slicedData200D = data.chartData.slice(0, 200);
    const price200DaysAgo = slicedData200D[slicedData200D.length - 1].close_price || 1;

    // A. CORE METRICS ENGINEe
    const prices200D = slicedData200D.map(d => d.close_price);
    const maxPrice200D = Math.max(...prices200D);
    const macroReturn200D = (latestPrice - price200DaysAgo) / price200DaysAgo;
    const peakDrawdown = (maxPrice200D - latestPrice) / maxPrice200D;

    // Liquidity & Relative Volume Metrics
    const dailyDollarVolumes = slicedData200D.map(d => d.close_price * d.volume);
    const sortedDollarVolumes = [...dailyDollarVolumes].sort((a, b) => a - b);
    const medianDollarVolume = sortedDollarVolumes[Math.floor(sortedDollarVolumes.length / 2)] || 0;

    const currentDollarVolume = latestPrice * (latest.volume || 1);
    const relativeVolumeRatio = currentDollarVolume / (medianDollarVolume || 1);
    const isInstitutionallyLiquid = medianDollarVolume > 5000000;

    // SMA slope: compare current SMA200 against the SMA that would have been
    // computed 50 days ago (using data starting at that offset).
    const oldData200 = data.chartData.slice(50, 250);
    const oldSMA200 = oldData200.reduce((sum, d) => sum + d.close_price, 0) / 200;
    const sma200Slope = (latest.sma200 - oldSMA200) / oldSMA200;

    const isFallingHard = macroReturn200D < -0.05;

    // FIX 3: single isNearSMA definition at the top of the function, 4% threshold.
    // The below-SMA branch previously used a tighter 2% threshold; that check
    // has been inlined at its call site with an explicit comment so the intent
    // is clear and there is no shadowing.
    const isNearSMA = Math.abs(latestPrice - latest.sma200) / latest.sma200 < 0.04;

    const recentRepricingIndex = [1, 2, 3].find(i => {
  const prev = chartData[i + 1]?.close_price;
  const curr = chartData[i]?.close_price;
  if (!prev || !curr) return false;
  return (curr - prev) / prev < -0.15;
});

const isPostFundamentalRepricing = recentRepricingIndex !== undefined;

    // ==========================================
    // CRITICAL EDGE GUARDS (reordered per audit)
    // ==========================================

    // GUARD 1: Zombie Market — must be first; no other signal matters on a dead market
    if (medianDollarVolume < 100000) {
      return "Illiquid Zombie Asset";
    }

    // GUARD 2: Flash/Velocity Crash (The "Tanking" detector)
    const oneDayChange = (latestPrice - previousPrice) / previousPrice;
    const isPanic = currentZScore < -1.8 && relativeVolumeRatio > 1.5;
    if (oneDayChange < -0.15) {
  if (isPanic) return isDecaying ? "Falling Knife (It's so over)" : "Flash Crash";
  return "Fundamental Repricing";
}

if (isPostFundamentalRepricing && isAbove200SMA) {
  if (oneDayChange < -0.02) return "Fundamental Repricing (Continued Selloff)";
  if (Math.abs(oneDayChange) <= 0.02) return "Fundamental Repricing (Stabilising)";
}

    // GUARD 3: Intraday pump & dump vs legitimate catalyst
    const openPrice = latest.open_price || latestPrice;
    const highPrice = latest.high_price || latestPrice;
    const lowPrice = latest.low_price || latestPrice;
    const intradayPump = (highPrice - openPrice) / openPrice;
    const totalIntradayRange = highPrice - openPrice;
    const retracementFromHigh = highPrice - latestPrice;
    const isHighVolume = relativeVolumeRatio > 1.5;

    const dailyRange = highPrice - lowPrice;
    const closePosition = dailyRange > 0
      ? (latestPrice - lowPrice) / dailyRange
      : 0.5;
    const gappedUp = openPrice > previousPrice * 1.03;
    const closedStrong = closePosition > 0.45;
    const likelyLegitimate = gappedUp && closedStrong;

    if (intradayPump > 0.15 &&
      (retracementFromHigh / totalIntradayRange) > 0.75 &&
      isHighVolume) {

      // Institutionally liquid — large caps don't get manipulated this way
      // retracement is almost certainly profit taking on real news
      if (isInstitutionallyLiquid) {
        return "Volatile Session (Profit Taking)";
      }

      // Gap up open + closed in upper half of range despite retracement
      // suggests overnight news catalyst, not intraday coordination
      if (likelyLegitimate) {
        return "Volatile Session (Profit Taking)";
      }

      // Illiquid + no gap + closed near low + extreme retracement
      // textbook intraday coordination pattern
      return "Intraday Volatility Trap (Pump and Dump)";
    }

    // GUARD 4: Failed breakout reversal 
    // Look at last 10 days .
    const lookbackWindow = 10;
    let highestPrice = 0;
    let highestIndex = -1;

    for (let i = 0; i < lookbackWindow; i++) {
      if (chartData[i].close_price > highestPrice) {
        highestPrice = chartData[i].close_price;
        highestIndex = i;
      }
    }

    //A breakout is "fresh" if it happened within the last 5 days
    const isFreshBreakout = highestIndex > 0 && highestIndex <= 5;
    const yesterdayBrokeOut = highestIndex > 0 && previousPrice > highestPrice * 1.01;
    const todayFailedBackInside = latestPrice < highestPrice;
    const isHardReversal = currentZScore < 0.5 && latestPrice < previousPrice;

    if (yesterdayBrokeOut && todayFailedBackInside && isHardReversal && isFreshBreakout) {
      return "Failed Breakout Reversal (Bull Trap)";
    }

    // Short-term whipsaw — volatile sessions (your original)
const shortWindow = chartData.slice(0, 7);
let shortDirectionChanges = 0;
let lastDir: 'up' | 'down' | null = null;

for (let i = 0; i < shortWindow.length - 1; i++) {
  const move = (shortWindow[i].close_price - shortWindow[i+1].close_price) / shortWindow[i+1].close_price;
  if (Math.abs(move) < 0.02) continue;
  const dir = move > 0 ? 'up' : 'down';
  if (lastDir !== null && dir !== lastDir) shortDirectionChanges++;
  lastDir = dir;
}

// Macro-range whipsaw — sample every ~10 days over 200 days
const macroSamples = Array.from({ length: 20 }, (_, i) => 
  chartData[i * 10]?.close_price
).filter(Boolean);

let macroDirectionChanges = 0;
let macroLastDir: 'up' | 'down' | null = null;

for (let i = 0; i < macroSamples.length - 1; i++) {
  const move = (macroSamples[i] - macroSamples[i+1]) / macroSamples[i+1];
  if (Math.abs(move) < 0.03) continue; // slightly higher threshold for macro
  const dir = move > 0 ? 'up' : 'down';
  if (macroLastDir !== null && dir !== macroLastDir) macroDirectionChanges++;
  macroLastDir = dir;
}

const isShortWhipsaw = shortDirectionChanges >= 2;
const isMacroWhipsaw = macroDirectionChanges >= 6; // lots of reversals over 200 days

const isMacroUptrend  = isAbove200SMA && sma200Slope > 0.01;
const isMacroRanging  = Math.abs(sma200Slope) <= 0.01;

if (isMacroWhipsaw && isMacroRanging) {
  return "Range-Bound (Stuck in a Range)";
}

if (isShortWhipsaw) {
  return isMacroUptrend 
    ? "Choppy Consolidation"
    : "Whipsaw (No Structural Support)";
}

    // GUARD 5: Volume anomaly — moved after the failed-breakout check so a
    // zScore < 0.5 / high-volume scenario is first evaluated as a potential
    // failed breakout before falling back to this generic label.
    if (zScore < -1.2 && relativeVolumeRatio > 2.0 && isAbove200SMA) {
      return "Institutional Dip Absorption";
    }

    //price actually moved less than 3% from high to low during the session, confirming it's pinned to a range
    const intradayRangePercent = (highPrice - lowPrice) / openPrice;
    const isPriceActuallyPinned = intradayRangePercent < 0.03;


    if (zScore > -1.2 && zScore < 0.5 && relativeVolumeRatio > 2.0 && isPriceActuallyPinned) {
      return "Volume Anomaly (Price Pinned)";
    }

    //Extreme pump guard
    if (zScore > 2.0) return "Extreme Short-Term Overextension";

    // GUARD 6: Divergent volume / hype pump
    if (zScore > 1.2 && relativeVolumeRatio < 0.7) {
      return "Extended Rally (Fading Momentum)";
    }
    if (!isInstitutionallyLiquid && relativeVolumeRatio > 12.0) {
      if (likelyLegitimate) return "Unusual Volume (Potential Catalyst)";
      return "Retail Hype Pump";
    }

    // GUARD 7: Volatility compression (coiled spring)
    // Uses the top-level isNearSMA (4% threshold). No shadowing.
    if (volatilityGuard?.isCompressed && isNearSMA && !isFallingHard) {
      return "Volatility Compression (Coiled Spring)";
    }
    

    // ==========================================
    // MAIN REGIME CORE LOGIC
    // ==========================================

    // 1. EXPLOSIVE MOMENTUM / BREAKOUT
    const wasInBreakout = previousPrice > (data.chartData[5]?.close_price || 0) * 1.10;
    const isCoolingOff = zScore < 1.0 && zScore > 0;

    if (wasInBreakout && isCoolingOff) {
      inPriceDiscovery = false;
      return "Post-Momentum Consolidation";
    }
    const momentumStrength = (zScore > 1.5 ? 2 : (zScore > 1.0 ? 1 : 0));
    const volumeStrength = (relativeVolumeRatio > 1.5 ? 1 : 0);
    const priceAboveOpen = latestPrice > openPrice;
    const notReversingHard = latestPrice > previousPrice * 0.97;
    const closingInUpperHalf = closePosition > 0.4;

    if (
      inPriceDiscovery &&
      (momentumStrength + volumeStrength >= 2) &&
      notReversingHard &&
      closingInUpperHalf &&
      priceAboveOpen
    ) {
      return "Upward Price Discovery (Breakout)";
    }

    // 2. DECAY CONDITION MATRIX
    const isComingOffStrength = macroReturn200D > 0.20;
    const isSignificantDrawdown = peakDrawdown > 0.25;

    if (isDecaying) {
      if (inPriceDiscovery && discoveryType === 'DOWNWARD' && zScore > -1.0) return "Post Liquidation Phase";

      if (isComingOffStrength && !isInstitutionallyLiquid) {
        return "Post-Hype Liquidation Trap (Value Decay)";
      }

      if (isComingOffStrength && isInstitutionallyLiquid) {
        return isAbove200SMA ? "Institutional Support Zone" : "Deep Cycle Discount";
      }

      // Check for active recovery BEFORE evaluating historical drawdown
      const isRecoveringFromDecay =
        zScore > 0.8 &&
        sma200Slope > 0.00 &&
        relativeVolumeRatio > 1.2 &&
        !inPriceDiscovery;

        

      if (isRecoveringFromDecay) {
        
        return isAbove200SMA
          ? "Trend Recovery (Regaining Strength)"
          : "Upward Price Discovery (Bear Market Breakout)";
      }

      if (isSignificantDrawdown && isInstitutionallyLiquid) {
        return isAbove200SMA ? "Institutional Support Zone" : "Structural Decay (Extended Downtrend)";
      }

      return isAbove200SMA ? "Weakening Trend (Loss of Momentum)" : "Structural Grind Down";
    }

    // 3. STANDARD REGIME MATRIX
    if (inPriceDiscovery && discoveryType === 'DOWNWARD') return "Downward Price Discovery (Liquidation Flush)";
    if (isAbove200SMA) {
      if (zScore > 1.2) return "Extended Momentum (Approaching Ceiling)";
    }

    const isVolumeDropoff = relativeVolumeRatio < 0.5;
    const isMomentumNeutral = zScore > -0.5 && zScore < 0.5;
    const currentAtrRatio = volatilityGuard?.atrRatio ?? 1.0; // Default to 1.0 (neutral) if missing
    const isPostVolatile = currentAtrRatio > 1.5;

    if (isVolumeDropoff && isMomentumNeutral) {
      if (isPostVolatile) {
        inPriceDiscovery = false;
        return "Post-Event Consolidation";
      }
      // Institutional check is now a "subset" of Global Consolidation
      if (isInstitutionallyLiquid && sma200Slope > -0.01) {
        inPriceDiscovery = false;
        return "Extended Consolidation (Volatility Compression)";
      }
      inPriceDiscovery = false;
      return "Extended Consolidation (Low Activity)";
    }

    //Check for low volume reversal = dead cat bounce
    if (isAbove200SMA) {
      if (zScore < -1.2) return "Low Activity Dip";
      inPriceDiscovery = false;
      return "Healthy Consolidation";
    }
    const isGradualRecovery = macroReturn200D > 0.05 && sma200Slope > 0.00 && !isDecaying;

    if (isGradualRecovery) {
      return "Baseline Recovery (Testing SMA)";
    }

    // Sharp drop, high volume below SMA = genuine selling pressure
    if (zScore < -1.8) return "Falling Knife (Slow Decay)";

    // Positive momentum with institutional backing below SMA = potential real recovery
    if (zScore > 0.8 && isInstitutionallyLiquid && relativeVolumeRatio > 1.2 && sma200Slope > 0.02) {
      return "Upward Price Discovery (Bear Market Breakout)";
    }

    // Mild positive momentum but low volume below SMA = likely a fake bounce
    if (zScore > 0.5 && zScore < 1.0 && relativeVolumeRatio < 0.8) {
      return "Bear Market Trap (Dead Cat Bounce)";
    }

    return "Structural Grind Down";

  };

  const status = getStatus(isAbove200SMA, currentZScore);
  const activeStatus = STATUS_MATRIX[status];
  const zScoreConfig = getZScoreExplained(currentZScore);
  const zScoreBadge = getZScoreBadge(currentZScore)
  const cardClassString = getCardStyles(discoveryType, status);

  let suggestedBuyLimit: number | null = null;
  let strategyMessage = "";
  let bluebox = false;
  const discountThreshold = 0.98; //Find a price that is 2% lower than the current price
  const maxPriceAllowed = latestPrice * discountThreshold;

  if (status === "Extreme Short-Term Overextension" || status === "Extended Momentum (Approaching Ceiling)") {
    suggestedBuyLimit = null;
    bluebox = true;
    strategyMessage = "Price is overextended. It is recommended to wait for a pullback before entry.";
  } else if (status === "Failed Breakout Reversal (Bull Trap)") {
    suggestedBuyLimit = null;
    bluebox = true;
    strategyMessage = "A breakout just failed and reversed. Buyers are trapped above, entering here risks becoming their liquidity. Wait for the flush to complete.";
  } else if (status === "Falling Knife (It's so over)" || status === "Falling Knife (Slow Decay)") {
    suggestedBuyLimit = null;
    strategyMessage = "No structural floor identified. Price is in freefall. Entering without a confirmed base risks catching a falling knife with no bounce.";
  }
  else if (status === "Retail Hype Pump") {
    suggestedBuyLimit = null;
    bluebox = true;
    strategyMessage = "Volume spike is retail-driven with no institutional backing. These moves unwind violently. Enter at your own risk.";
  } else if (status === "Flash Crash") {
    // Non-decaying panic — potential V-shape bounce
    const panicFloor = pocPrice > 0 && pocPrice < latestPrice
      ? parseFloat((pocPrice * 1.003).toFixed(2))
      : parseFloat((latestPrice * 0.985).toFixed(2));
    suggestedBuyLimit = panicFloor;
    strategyMessage = "Panic liquidation with no structural decay. Entry set near the point of control or 3% below current price to catch a potential V-shape recovery.";
  } else if (status === "Intraday Volatility Trap (Pump and Dump)") {
    bluebox = true;
    suggestedBuyLimit = null;
    strategyMessage = "Intraday pump has already reversed sharply. Buyers are trapped above, entering here risks becoming their liquidity.";
  } else if (status === "Volatility Compression (Coiled Spring)") {
    bluebox = true;
    suggestedBuyLimit = parseFloat((latestPrice * 0.998).toFixed(2));
    strategyMessage = "Price is coiled in a compression range. volatility expansion is imminent but direction is unconfirmed. Entry set at current price. Be ready to cut quickly if it breaks downward instead.";
  } else if (inPriceDiscovery) {
    suggestedBuyLimit = null;
    strategyMessage = discoveryType === 'DOWNWARD'
      ? "Price is breaking down with no clear sign of buyers stepping in to stop the bleed. Nobody knows where it will stop."
      : "Price is surging into new territory with no resistance above. High risk of a sharp pullback.";
  } else if (status === "Low Activity Dip") {
    if (pocPrice > 0 && pocPrice < latestPrice) {
      suggestedBuyLimit = parseFloat((pocPrice * 1.003).toFixed(2));
      strategyMessage = `Macro structure is bullish and momentum is exhausted. Front-running the fair value price at $${pocPrice}.`;
    } else {
      suggestedBuyLimit = parseFloat((latestPrice * 0.99).toFixed(2));
      strategyMessage = `Macro structure is bullish, but short-term momentum is deeply exhausted. Entry limit set 1% under current price to capture intra-day capitulation.`;
    }
  }
  else {
    // --- GENERAL CONSOLIDATION / EQUILIBRIUM STRUCTURAL MATRIX ---
    const validFloorNodes = topNodes.filter(node => node.priceBin <= maxPriceAllowed);

    // Define how far away a node can be before it's considered useless (e.g., 12%)
    const MAX_NODE_DISTANCE_PCT = 0.10;

    if (validFloorNodes.length > 0) {
      validFloorNodes.sort((a, b) => b.priceBin - a.priceBin);
      const targetNode = validFloorNodes[0].priceBin;
      const distanceToNodePct = (latestPrice - targetNode) / latestPrice;

      // SENSITIVITY CHECK 1: Did the price run away from the node?
      if (distanceToNodePct > MAX_NODE_DISTANCE_PCT) {
        // 🚨 RUNAWAY PRICE PROTOCOL 🚨
        // Node is too far away to act as immediate support. Switch to dynamic anchors.

        // Fallback Option A: Use a short-term SMA if you have it (e.g., 20 SMA)
        // suggestedBuyLimit = parseFloat((latest.sma20 * 1.005).toFixed(2));

        // Fallback Option B: Volatility/ATR pullback (e.g., buy a 3% dip)
        suggestedBuyLimit = parseFloat((latestPrice * 0.97).toFixed(2));
        strategyMessage = `Price has moved far above its last major support level (${(distanceToNodePct * 100).toFixed(1)}% above) to use it as a reliable entry point. Recommend entry at a standard 3% pullback instead.`;

      }
      // SENSITIVITY CHECK 2: Are we above or below this heavy accumulation shelf?
      else if (latestPrice > targetNode) {
        // Node is beneath us (True Support Floor) and within a healthy distance.
        suggestedBuyLimit = parseFloat((targetNode * 1.003).toFixed(2));
        strategyMessage = `Price is consolidating above key historical support ($${targetNode}). Entry limit set just above to front-run institutional buy walls.`;
      }
      else {
        // Node is above us (Overhead Resistance Ceiling).
        suggestedBuyLimit = parseFloat((latestPrice * 0.99).toFixed(2));
        strategyMessage = `Major volume node ($${targetNode}) is acting as heavy overhead resistance. Entry limit shaved 1% below current price to await local support stability.`;
      }

    } else if (pocPrice > 0 && pocPrice < latestPrice) {
      const distanceToPocPct = (latestPrice - pocPrice) / latestPrice;

      if (distanceToPocPct > MAX_NODE_DISTANCE_PCT) {
        // Same runaway logic for the POC
        suggestedBuyLimit = parseFloat((latestPrice * 0.97).toFixed(2));
        strategyMessage = `POC ($${pocPrice}) is too far below current price. Asset is in price discovery. Entry set for a standard 3% local pullback.`;
      } else {
        // POC is below us (Support) and close enough to matter
        suggestedBuyLimit = parseFloat((pocPrice * 1.003).toFixed(2));
        strategyMessage = `No nearby volume shelves found. Entry is front-running the point of control ($${pocPrice}) where global volume is heaviest.`;
      }
    } else {
      // POC is above us or missing. Track local price action decay.
      suggestedBuyLimit = parseFloat((latestPrice * 0.99).toFixed(2));
      strategyMessage = "Price is searching for a local bottom below historical nodes. Entry set slightly below current price to capture daily volatility tails.";
    }
  }



  return (
    <>
      <div className={cardClassString} onClick={() => setShowModal(true)}>
        <h2 className="text-xl font-bold tracking-tight text-gray-900 mb-1 ">{ticker}</h2>
        <p className="text-sm text-gray-600  font-semibold mb-1">

          Status: <span className={inPriceDiscovery ? "text-amber-700 font-bold" : "text-gray-900"}>{status}</span>
        </p>
        <p className="text-sm font-medium text-gray-700 ">Current price: <span className="font-semibold">${latestPrice.toFixed(2)}</span></p>
        <span className="inline-block mt-1 text-xs px-2 py-0.5 font-mono bg-gray-100  text-gray-600  rounded">
          {zScoreBadge.label}
        </span>


        <div className="border-t border-gray-100 pt-3 mt-3 space-y-2">
          {inPriceDiscovery ? (
            <>
              <div className="bg-red-50/60 border border-red-100 p-3 rounded-lg text-xs space-y-1.5">
                <div className="flex justify-between items-center text-red-800 font-bold uppercase text-[10px]">
                  <span>🚨 CAUTION: Currently in price discovery</span>
                </div>
                <p className="text-red-900 leading-relaxed font-medium">{strategyMessage}</p>
                <div className="text-[11px] text-red-600 italic font-medium text-center border-t border-red-200/40 pt-1.5">
                  "The market is repricing this asset. Until it finds a level, there is no predictable entry point."
                </div>
              </div>
              {topNodes.length > 0 && (
                <div className="pt-1">
                  <span className="text-[11px] font-medium text-gray-600">Historical anchors:</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {[...topNodes].sort((a, b) => a.priceBin - b.priceBin).slice(0, 3).map((node, idx) => (
                      <span key={idx} className="bg-gray-100 border-gray-200 text-gray-700 text-[11px] font-mono px-2 py-0.5 rounded-md">
                        ${node.priceBin.toFixed(2)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-[10px] font-bold text-gray-400 uppercase">VPVR Order Levels</div>
              <div className="flex justify-between items-center text-xs text-gray-600">
                <span>🎯 Most Traded Price:</span>
                <span className="font-mono font-bold text-blue-600 bg-gray-100 px-1.5 py-0.5 rounded">${pocPrice.toFixed(2)}</span>
              </div>

              {suggestedBuyLimit && (
                <div className="flex justify-between bg-blue-50/70 border border-blue-100 px-2.5 py-1 rounded-md text-xs items-center">
                  <span className="text-blue-700 font-medium">🛒 Suggested Entry Limit:</span>
                  <span className="font-mono font-bold text-blue-700 text-sm">${suggestedBuyLimit.toFixed(2)}</span>
                </div>
              )}

              {(bluebox === true) ? (
                // STYLE A: Blue Box for Overextended Statuses
                <div className="bg-blue-50/70 border border-blue-100 px-2.5 py-1 rounded-md text-xs items-center">
                  <p className="text-blue-800 font-medium leading-relaxed">
                    {strategyMessage}
                  </p>
                </div>
              ) : (
                // STYLE B: Your original, plain text styling for all other statuses
                <p className="text-[11px] text-gray-500 italic font-medium pt-0.5 leading-relaxed">
                  {strategyMessage}
                </p>
              )}

              {topNodes.length > 0 && (
                <div className="pt-1">
                  <span className="text-[11px] font-medium text-gray-400 ">Historical anchors:</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {[...topNodes].sort((a, b) => a.priceBin - b.priceBin).slice(0, 3).map((node, idx) => (
                      <span key={idx} className="bg-gray-100  border-gray-200 da text-gray-700 da text-[11px] font-mono px-2 py-0.5 rounded-md">
                        ${node.priceBin.toFixed(2)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div id="limit-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30 hidden">
        <div className="bg-white p-6 rounded-lg shadow-xl text-center">
          <h2 className="text-xl font-bold text-red-600 mb-2">Limit Reached</h2>
          <p className="text-gray-700 mb-4">You can only track 40 assets.</p>
          <button onClick={() => document.getElementById('limit-modal')!.classList.add('hidden')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>

      {/* --- MODAL LAYOUT --- */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 bg-slate-800 text-slate-100 rounded-xl shadow-2xl border border-slate-700 scrollbar-none" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowModal(false)}
              className="float-right px-4 py-2 text-sm font-medium bg-slate-700 border border-slate-600 rounded-lg text-slate-200 cursor-pointer hover:bg-slate-600 transition-colors"
            >
              Close
            </button>

            <div className="mt-12">
              <ClientOnlyChart
                ticker={ticker}
                data={{
                  chartData: chartData,
                  volumeProfile: data.volumeProfile.bins
                }}
              />
            </div>

            {/* --- DETAILED VERDICT ELABORATION --- */}
            <div className="mt-6 border-t border-slate-700 pt-6">
              <h3 className="text-xl font-bold text-sky-400 mb-4">
                Verdict: {status}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800">
                  <strong className="block text-slate-400 mb-1 text-xs uppercase font-bold tracking-wider">
                    Macro Trend (200 SMA)
                  </strong>
                  {latest.sma200 === null || latest.sma200 === undefined ? (
                    <>
                      <span className="text-base font-semibold text-slate-400">
                        ⏳ Not enough data
                      </span>
                      <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                        This asset doesn't have enough trading history to calculate a long-term trend yet. Check back once it has at least 200 days of price data.
                      </p>
                    </>
                  ) : (
                    <>
                      <span className={`text-base font-semibold ${isAbove200SMA ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isAbove200SMA ? "🟢 Long-Term Uptrend" : "🔴 Long-Term Downtrend"}
                      </span>
                      <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                        {isAbove200SMA
                          ? "The asset is trading above its 200-day moving average, signaling institutional accumulation and macro bullish characteristics."
                          : "The asset is trading below its 200-day moving average, indicating structural weakness and persistent sell-side pressure."}
                      </p>
                    </>
                  )}
                </div>

                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800">
                  <strong className="block text-slate-400 mb-1 text-xs uppercase font-bold tracking-wider">
                    Deviation from average (Rolling VWAP Z-Score)
                  </strong>
                  {currentZScore === null || currentZScore === undefined ? (
                    <>
                      <span className="text-base font-semibold text-slate-400">
                        ⏳ Not enough data
                      </span>
                      <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                        This asset doesn't have enough trading history to calculate a long-term trend yet. Check back once it has at least 20 days of price data
                      </p>
                    </>
                  ) : (
                    <>
                      <span className={`text-base font-semibold ${zScoreConfig.style}`}>
                        {zScoreConfig.label} ({currentZScore.toFixed(2)})
                      </span>
                      <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                        {zScoreConfig.description}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* --- SCENARIO MATRIX INTELLIGENCE BLOCK --- */}
              {activeStatus ? (
                <div className={`bg-slate-900 p-5 rounded-lg border-y border-r border-slate-800 border-l-4 ${variantBorderClasses[activeStatus.variant] || 'border-l-slate-500'}`}>
                  <h4 className="text-sm font-semibold text-slate-200 mb-2">Data Interpretation</h4>

                  <div>
                    <p className="text-slate-300 leading-relaxed text-xs">
                      <strong className="text-slate-200">Analysis:</strong> {activeStatus.analysis}
                    </p>

                    <div className={`mt-3 text-xs ${variantTextClasses[activeStatus.variant] || 'text-slate-300'}`}>
                      👉 <strong>Recommendation:</strong> {activeStatus.recommendation}
                    </div>

                    {/* Conditionally show optional sub-blocks if they exist in the current status data */}
                    {activeStatus.caution && (
                      <div className="mt-2 text-rose-400/90 text-[11px] leading-normal bg-rose-950/20 border border-rose-900/30 rounded p-2">
                        ⚠️ <strong>Caution:</strong> {activeStatus.caution}
                      </div>
                    )}

                    {activeStatus.tip && (
                      <div className="mt-2 text-amber-300 text-xs leading-normal bg-amber-950/20 border border-amber-900/40 rounded p-2">
                        💡 <strong>Tip:</strong> {activeStatus.tip}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Optional Fallback if the status isn't found in your matrix */
                <div className="bg-slate-900 p-5 rounded-lg border border-slate-800 text-xs text-slate-400 italic">
                  No interpretation layout available for status: "{status}"
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
