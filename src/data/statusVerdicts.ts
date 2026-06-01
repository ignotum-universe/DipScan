// src/constants/statusMatrix.ts

export interface StatusConfig {
  analysis: string;
  recommendation: string;
  variant: 'danger' | 'warning' | 'success' | 'info' | 'neutral';
  tip?: string;
  caution?: string;
}

interface getZScoreExplained {
  label: string;
  style: string;
  description: string;
}

export const getZScoreBadge = (score: number): { label: string; style: string } => {
  if (score > 2.0) return { label: "🚨 Overextended Mania", style: "text-red-400 font-bold animate-pulse" };
  if (score > 1.2) return { label: "⚠️ Extended Momentum", style: "text-rose-400" };
  if (score >= -1.2) return { label: "⚖️ Equilibrium", style: "text-slate-200" };
  if (score >= -1.8) return { label: "⚡ Premium Dip Zone", style: "text-emerald-400" };
  return { label: "🩸 Severely Oversold ", style: "text-red-400 font-bold" };
};

export const getZScoreExplained = (score: number): getZScoreExplained => {
  if (score > 2.0) {
    return {
      label: "🚨 Overextended Mania",
      style: "text-red-400 font-bold animate-pulse",
      description: "Price has run way too far, way too fast. A sharp pullback is likely."
    };
  }
  if (score > 1.2) {
    return {
      label: "⚠️ Extended Momentum",
      style: "text-rose-400",
      description: "Price is actively stretching above its short-term mean. Momentum is strong but approaching a local overhead ceiling."
    };
  }
  if (score < -1.8) {
    return {
      label: "🩸 Severely Oversold",
      style: "text-red-400 font-bold animate-pulse",
      description: "Price has fallen off a cliff and hasn't stopped yet. There may be a bounce coming, but there's no floor in sight."
    };
  }
  if (score < -1.2) {
    return {
      label: "⚡ Premium Dip Zone",
      style: "text-emerald-400",
      description: "Price is noticeably below where it normally sits. In an uptrend, this is THE dip"
    };
  }

  // Default fallback: Equilibrium baseline (-1.2 to 1.2)
  return {
    label: "⚖️ Equilibrium",
    style: "text-slate-200",
    description: "Price is trading right around where it normally should be. No extremes in either direction."
  };
};

export const variantBorderClasses = {
  danger: 'border-l-red-500',
  warning: 'border-l-amber-500',
  success: 'border-l-emerald-500',
  info: 'border-l-sky-500',
  neutral: 'border-l-slate-500',
};

export const variantTextClasses = {
  danger: 'text-rose-300',
  warning: 'text-amber-300',
  success: 'text-emerald-300',
  info: 'text-cyan-400',
  neutral: 'text-slate-300',
};

export const getCardStyles = (discoveryType: string | null, status: string): string => {
  const baseClasses = "p-5 h-full flex-1 rounded-xl border transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md bg-white text-gray-900";

  // DANGER — red
  if (
    status.includes("Falling Knife") ||
    status.includes("Downward Price Discovery") ||
    status.includes("Extreme Short-Term Overextension") ||
    status.includes("Failed Breakout Reversal") ||
    status.includes("Post Liquidation Phase") ||
    status.includes("Structural Decay")
  ) {
    return `${baseClasses} border-red-300 hover:border-red-400 bg-red-50/20`;
  }

  // WARNING — amber
  if (
    status.includes("Extended Momentum") ||
    status.includes("Bear Market Trap") ||
    status.includes("Upward Price Discovery (Bear Market Breakout)") ||
    status.includes("Post-Hype Liquidation Trap") ||
    status.includes("Intraday Volatility Trap") ||
    status.includes("Illiquid Zombie Asset") ||
    status.includes("Extended Rally") ||
    status.includes("Retail Hype Pump") ||
    status.includes("Flash Crash") ||
    status.includes("Unusual Volume")
  ) {
    return `${baseClasses} border-amber-300 hover:border-amber-400 bg-amber-50/20`;
  }

  // SUCCESS — green
  if (
    status.includes("Standard Bull Market Baseline") ||
    status.includes("Low Activity Dip") ||
    status.includes("Institutional Dip Absorption") ||
    status.includes("Healthy Trend Consolidation") ||
    status.includes("High-Volume Macro Floor Consolidation") ||
    status.includes("Upward Price Discovery (Breakout)") ||
    status.includes("Extended Consolidation (Volatility Compression)") ||
    status.includes("Post-Momentum Consolidation")
  ) {
    return `${baseClasses} border-emerald-300 hover:border-emerald-400 bg-emerald-50/20`;
  }

  // INFO — blue
  if (
    status.includes("Deep Cycle Discount") ||
    status.includes("Post-Event Consolidation") ||
    status.includes("Volume Anomaly") ||
    status.includes("Volatility Compression (Coiled Spring)") ||
    status.includes("Baseline Recovery")
  ) {
    return `${baseClasses} border-sky-300 hover:border-sky-400 bg-sky-50/20`;
  }

  // NEUTRAL — gray
  if (
    status.includes("Structural Grind Down") ||
    status.includes("Extended Consolidation (Low Activity)") ||
    status.includes("Volatile Session") ||
    status.includes("Insufficient Data")
  ) {
    return `${baseClasses} border-gray-300 hover:border-gray-400 bg-gray-50/20`;
  }

  // Fallback
  return `${baseClasses} border-gray-200 hover:border-gray-300`;
};

  //Retired
  // "Healthy Trend Consolidation": {
  //   analysis: "The long-term direction is still up, but the price has dropped sharply in the short term. This is often caused by panic selling or a temporary shakeout.",
  //   recommendation: "This is a good time to buy. Consider putting in more than your usual amount. Price drops within an upward trend tend to be where the best buying opportunities show up.",
  //   variant: 'success'
  // },


export const STATUS_MATRIX: Record<string, StatusConfig> = {
  "Insufficient Data (Recent IPO / Low History)": {
    analysis: "This asset does not have enough price history to show a reliable trend. Most signals in this analysis need at least 200 days of data to work properly, and this one does not have that yet. Any reading shown here is based on incomplete information and should not be relied on.",
    recommendation: "Be extra careful here. Without enough history to compare against, there is no way to tell if the current price is cheap, expensive, or just random movement.",
    tip: "New ETFs and recent IPOs tend to have big price swings early on as the market figures out what they are worth. The first 6 to 12 months of trading is often driven more by buying and selling pressure than by the actual value of the asset.",
    variant: 'neutral'
  },
  "Extreme Short-Term Overextension": {
    analysis: "The price has risen too far, too fast in a short period of time. Buying now means paying a high price and taking on more risk of a drop.",
    recommendation: "Wait before adding more. Let the price settle before buying. If you are already in profit, you may want to sell some now and look to buy back if the price drops.",
    variant: 'danger'
  },
  "Standard Bull Market Baseline (Healthy Consolidation)": {
    analysis: "The price is consolidating after a recent rise, which is completely normal. It is still well above its long-term trend line with no signs of panic or heavy selling. The market is simply taking a breather before the next move.",
    recommendation: "This is a reasonable time to buy. The long-term trend is still up and the price is in a healthy resting phase. You do not need to wait for a dip to justify adding here.",
    tip: "Sideways movement in an uptrend is the market consolidating gains before continuing. Most long-term investors who buy during these consolidation phases end up with better average prices than those waiting for a dramatic dip that may never come.",
    variant: 'success'
  },
  "Low Activity Dip": {
    analysis: "The price has quietly drifted down to a notably low level relative to where it normally trades, but without any spike in selling activity or panic behind it. The long-term trend is still pointing up and there is no sign of a major event driving the drop. The price has simply slipped down gradually with normal day to day trading.",
    recommendation: "This is a reasonable time to buy. The trend is intact, the price is at a discount, and the lack of panic means you are not buying into volatility. You are getting a calmer entry point than usual inside an ongoing uptrend.",
    tip: "Dips without panic are often cleaner buying opportunities than sharp drops because the price tends to be more stable. There is no crowd of late panic sellers still waiting to exit above you, which means less resistance on the way back up.",
    variant: 'success'
  },
  "Bear Market Trap (Dead Cat Bounce)": {
    analysis: "The overall trend is still pointing down, but the price just jumped up sharply. This can look like a recovery, but it often is not. Even a falling asset can bounce temporarily before continuing lower.",
    recommendation: "Do not mistake this bounce for a real recovery. Avoid buying into the excitement. Wait until the long-term trend starts pointing up again before taking another look.",
    variant: 'warning'
  },
  "Structural Grind Down": {
    analysis: "The asset is slowly and steadily losing value with no clear signs of recovery. There is no major event driving it, just consistent selling pressure over time.",
    recommendation: "Keep your exposure low. If you believe in this asset long term, only put in a small amount until the trend starts to turn around.",
    tip: "If the company is growing and making money, this slow decline can reverse quickly on good news. But if the company is not yet profitable and is spending through its cash, the decline usually means more shares will be issued over time, which lowers the value of existing shares. In that case, sudden price spikes are often short-lived traps rather than real recoveries.",
    variant: 'neutral'
  },
  "Falling Knife (Slow Decay)": {
    analysis: "The asset is in a downtrend and falling steadily. Even if the price looks cheap, there is no sign yet that the selling has stopped. What looks like a bargain can keep getting cheaper.",
    recommendation: "Wait for the price to stop falling and hold steady for a while before thinking about buying. Trying to guess the lowest point is speculating, not investing.",
    variant: 'danger'
  },
  "Downward Price Discovery (Liquidation Flush)": {
    analysis: "The price is breaking down sharply with heavy selling pressure overriding everything else. There is no clear floor in sight. The market has not yet found a level where buyers are willing to step in and buy the dip. As a result, the price is in freefall.",
    recommendation: "Do not buy here. The defining characteristic of this signal is that the market has not found a stopping point yet. Wait for the selling to visibly slow down and for the price to hold at a level for more than a day or two before considering an entry. If you do decide to buy, go in knowing this may not be the bottom.",
    variant: 'danger'
  },
  "Upward Price Discovery (Breakout)": {
    analysis: "The price is pushing upward strongly with momentum behind it. The move is happening with conviction and there is less overhead resistance to slow it down from here.",
    recommendation: "There is no need to chase the move right as it happens. A small pullback after a strong push tends to be a safer place to buy rather than rushing in at the peak of the momentum.",
    tip: "The higher the price goes without a pause, the more likely a short-term cooldown becomes. Waiting for the price to settle and hold at a new level before adding is generally a more reliable entry than buying into the surge itself.",
    variant: 'success'
  },
  "Extended Momentum (Approaching Ceiling)": {
    analysis: "The asset is still moving up, but it is getting close to a price level where sellers tend to step in. The further it stretches above its normal range, the less room it has to keep going before a drop becomes likely.",
    recommendation: "Not a great time to add more. If you are already holding, consider setting a stop loss to protect your gains rather than buying more at this level. Wait for the price to settle and move sideways for a while before buying again.",
    variant: 'warning'
  },
  "Falling Knife (It's so over)": {
    analysis: "This asset was already in a long-term downtrend and just got hit by a severe panic sell-off on top of it. The slow, ongoing decline it was already going through has now been made worse by the last remaining holders finally giving up and selling at the same time.",
    recommendation: "Do not buy this. This is one of the most dangerous situations to step into. Investors who were holding on during the slow decline are now panicking and rushing for the exits all at once. Wait for the selling to completely stop and for the price to flatten out over several days before looking at it again.",
    caution: "These events are usually triggered by bad news, a missed earnings report, a lawsuit, or a shock affecting the whole sector. Find out what caused it before doing anything. If the cause is a permanent change rather than a temporary one, the asset may not recover.",
    variant: 'danger'
  },
  "Flash Crash": {
    analysis: "The price dropped sharply in a very short period of time on an asset that otherwise looked healthy. This kind of move is usually caused by a sudden news shock, a large forced sale, or a chain reaction of automatic sell orders triggering at once, rather than a real change in the company's value.",
    recommendation: "Check the news before doing anything else. If the cause turns out to be temporary, a flash crash on an otherwise healthy asset is one of the better buying opportunities you will come across. These moves tend to recover quickly once the panic clears.",
    caution: "If the news points to a real and lasting problem with the company rather than a temporary shock, treat this as the start of a larger move down rather than a buying opportunity. The news check will be the entire basis for a decision.",
    variant: 'warning'
  },
  "Extended Consolidation (Volatility Compression)": {
    analysis: "The price has been moving sideways in a very tight range with low activity while sitting close to its long-term average. Large investors tend to quietly build their positions during these low-activity phases before the next move.",
    recommendation: "If you believe in this asset long term, this is a good time to buy steadily. The price is calm and predictable right now, which means you are not chasing a spike or buying into panic. These calm phases often precede larger moves.",
    tip: "You do not need to know which direction the next move will be to buy here. If your plan is to hold long term, buying during a quiet consolidation above the long-term trend line is one of the more reliable entry strategies.",
    variant: 'success'
  },
  "Extended Consolidation (Low Activity)": {
    analysis: "The price has been flat for a while with very little buying or selling activity. The market has largely lost interest, and neither buyers nor sellers are pushing it in any direction.",
    recommendation: "For a stable long term asset, flat price action may be perfectly fine. For a growth asset, it means the market is waiting for something meaningful to happen before taking a position.",
    tip: "A flat price with low activity usually means the asset has fallen off most investors' radar. It is not necessarily about to drop, but do not expect it to move until something significant happens to bring attention back to it.",
    variant: 'neutral'
  },
  "Post-Event Consolidation": {
    analysis: "The asset recently went through a sharp move and is now settling down. Volume has dropped and the price has steadied, which usually means the market is digesting what just happened. This typically follows a sudden drop such as a flash crash.",
    recommendation: "This could be a decent buying opportunity. The worst of the move looks to be over and the market has calmed down. Be aware that with low activity right now, any new move in either direction could happen quickly with little resistance.",
    caution: "The best buying opportunities after a drop come when the price settles and buying activity starts picking back up. If volume stays low and there is no sign of recovery, the price may drift lower rather than bounce.",
    variant: 'info'
  },
  "Volatile Session (Profit Taking)": {
    analysis: "The asset had a strong session but could not hold its highs. Sellers stepped in and took their profits on the way up. This is not necessarily a bad sign, it just means that people who bought earlier used the price spike as their exit.",
    recommendation: "Hold off and watch for the next few sessions. Wait for the price to find a stable level before making a move.",
    variant: 'neutral'
  },
  "High-Volume Macro Floor Consolidation": {
    analysis: "The asset has been holding steady at a strong price floor above its long-term trend line, with consistently high buying volume backing it up. This suggests large investors are actively buying at this level and defending the price.",
    recommendation: "This is a good zone to buy steadily over time. The risk is relatively low here because large investors appear to be supporting the price, which reduces the chance of a sharp drop from this level.",
    tip: "Large funds cannot buy all their shares at once without pushing the price up, so they spread their buying out over weeks by quietly absorbing shares as they become available. High volume during a sideways phase is often the sign that this is happening.",
    variant: 'success'
  },
  "Deep Cycle Discount": {
    analysis: "The price has dipped below its long-term trend line, but the overall structure of the asset still looks strong. Volume remains high, suggesting large investors are still actively buying at these lower levels rather than walking away.",
    recommendation: "This is a zone worth watching closely, not ignoring. Large investors sometimes use these below-trend dips to build up their positions gradually before the price recovers. If you still believe in the long term outlook for this asset, watch for signs of sustained buying activity at this level before adding.",
    variant: 'info'
  },
  "Baseline Recovery (Testing SMA)": {
    analysis: "The price is testing a key long-term level that tends to separate assets trending up from those trending down. It is at a turning point where it either pushes back above and resumes recovering, or gets pushed back down and continues falling.",
    recommendation: "This is a cautious buy zone for long-term investors who already have conviction in the asset. Buying in small amounts here makes sense if you are willing to hold through the uncertainty. If you want more confirmation first, wait for the price to close above this level on strong activity before adding more.",
    tip: "This level has historically acted as a meaningful turning point. Assets that reclaim it tend to recover meaningfully. Those that fail to hold it tend to drop further. Splitting your buy into two parts, one now and one after confirmation, is a reasonable way to manage the risk either way.",
    variant: 'info'
  },
  "Upward Price Discovery (Bear Market Breakout)": {
    analysis: "The price is surging upward out of a long period of slow decline with low activity. Because there was very little buying and selling during the decline, this sudden spike is more likely driven by a small group of large traders, social media hype, or short sellers being forced to buy back their positions, rather than genuine broad buying interest.",
    recommendation: "Hold off at these levels. This looks like a short-term spike rather than a real recovery. Buying into a fast move before the price has found a stable base often leads to buying near the top of the spike. Missing the first 5 to 10 percent of a real recovery is a small cost compared to the 20 to 30 percent drop that often follows these moves.",
    variant: 'warning'
  },
  "Post-Hype Liquidation Trap (Value Decay)": {
    analysis: "This asset had its moment, likely driven by hype or speculation, but that interest is gone. There is no serious buying activity holding the price up, and the remaining holders are slowly selling off over time, keeping the price pinned down with little sign of recovery.",
    recommendation: "Avoid this one. Without real buying pressure to push through the steady stream of sellers, any small price bounces will quickly get sold back down. There is no visible reason for that to change.",
    variant: 'warning'
  },
  "Intraday Volatility Trap (Pump and Dump)": {
    analysis: "The price jumped sharply during the day but gave back most or all of those gains before the close. This usually means early buyers sold into the rise, leaving anyone who bought late holding a loss.",
    recommendation: "Avoid this right now. A sharp rise that completely fades by the end of the day is a sign that there was no real demand behind the move. The rise was used by larger holders as a chance to sell their positions into buyers chasing the momentum.",
    variant: 'warning'
  },
  "Illiquid Zombie Asset": {
    analysis: "This asset has very little buying and selling activity on a typical day. That means there may not be enough people trading it to fill your order at the price shown, and you could end up paying more to buy or receiving less when selling than you expected.",
    recommendation: "Avoid buying this asset. The low activity makes it easy to get a worse price than expected and very difficult to exit quickly if things go wrong. Stick to assets with higher daily trading activity.",
    tip: "If you believe this asset has real potential, low activity alone does not rule that out. But you need to look for signs of real business activity: recent earnings reports, a working product, actual revenue, or recent news. Many low activity assets stay that way indefinitely.",
    variant: 'warning'
  },
  "Extended Rally (Fading Momentum)": {
    analysis: "The price has pushed into high territory, but the volume of trading behind that move is dropping off. When price keeps rising but fewer people are participating, it usually means the move is running out of fuel.",
    recommendation: "Be careful about buying in at this level. A rising price with shrinking trading activity is often an early sign that a reversal is coming. Wait for a small pullback before adding to your position.",
    variant: 'warning'
  },
  "Retail Hype Pump": {
    analysis: "Trading activity has spiked to an unusually high level following a major announcement, such as new shares being issued/breakthrough event, or news coverage by mainstream media. While this confirms the asset is getting attention, extreme spikes in activity after news often means early holders are selling into the pump.",
    recommendation: "Do not buy into the excitement. By the time activity spikes this dramatically, early holders are often already selling to the people rushing in. If you are already holding, consider whether this is a good time to take some profit rather than add more.",
    variant: 'warning'
  },
  "Volatility Compression (Coiled Spring)": {
    analysis: "The asset has been moving in a very tight range with almost no price movement up or down, while sitting close to its long-term average. Periods of very low movement like this tend to come before a large move in one direction as pressure builds up before a breakout.",
    recommendation: "Watch this one closely. A tight range does not tell you which direction the move will go, only that a big move is likely coming. Avoid buying based on this alone. Wait for a clear breakout direction before committing.",
    variant: 'info'
  },
  "Post Liquidation Phase": {
    analysis: "The asset has been steadily losing value and is now pushing into new lows with no clear floor in sight. This typically happens after a wave of forced selling: investors cutting losses, funds rebalancing, or traders being forced to sell to cover borrowed money. Each level that looked like a floor keeps giving way.",
    recommendation: "Do not try to catch this one. A liquidation phase is different from a normal pullback. There is no reliable level to buy at. Wait until the selling stops and the price begins to hold steady before considering an entry.",
    variant: 'danger'
  },
  "Volume Anomaly (Price Pinned)": {
    analysis: "A large amount of trading is flowing through this asset, but the price is barely moving. Either a large buyer is absorbing every share being sold to keep the price from dropping, or a large seller is offloading into every buyer to keep the price from rising. Either way, someone big is deliberately keeping the price in place.",
    recommendation: "Wait and see. Whichever direction the price breaks out of this range is likely the direction the large player was positioning for. When it moves, it tends to move fast.",
    caution: "This signal cannot tell you which way the price will move next. The same pattern shows up whether a large buyer is building a position or a large seller is quietly exiting. One side will eventually run out.",
    variant: 'info'
  },
  "Failed Breakout Reversal (Bull Trap)": {
    analysis: "This asset broke above a key price level recently, which looked like the start of a real move up. But it then fell back below that same level, wiping out the breakout entirely. The move up was a false alarm, and anyone who bought into the excitement is now sitting at a loss.",
    recommendation: "Do not buy this dip. The buyers who chased the breakout are now underwater and looking for any bounce to get out. That selling pressure will hold back any recovery attempt. Wait for the price to rebuild and hold above that level again before reconsidering.",
    caution: "A failed breakout is often more damaging than an asset that never broke out at all. The buyers who got trapped become sellers on any bounce, which can push the price down further.",
    variant: 'danger'
  },
  "Structural Decay (Extended Downtrend)": {
    analysis: "This asset has been slowly losing value over a long period of time. It has not collapsed in one dramatic crash, instead it has been a steady, grinding decline where every recovery attempt gets sold into and every support level eventually gives way. This is the pattern of a company where the market has lost confidence in its future, not just its short-term price.",
    recommendation: "This is not a value dip worth buying. The damage here goes deeper than the price. It reflects how the market views the company's future. Unless you have a strong reason to believe the business will turn around, avoid putting more money into something that has been declining for months.",
    caution: "Assets in a long-term decline can look cheap for a very long time before they either recover or continue falling. A low price alone is not a reason to buy. Look for a concrete reason for the trend to change before considering an entry.",
    variant: 'danger'
  },
  "Unusual Volume (Potential Catalyst)": {
    analysis: "The asset is seeing a large surge in trading activity along with a sharp jump in price. This kind of move is usually triggered by a specific piece of news such as an earnings report, a major partnership, or a regulatory decision.",
    recommendation: "Do not rush into this. Look up the news behind the move first to understand whether it represents a real and lasting change for the company, or whether it is the kind of event where the excitement fades quickly and the price drops back down after the initial reaction.",
    tip: "If the price holds near its highs by the end of the day, it suggests larger investors are behind the move rather than people chasing the news. Watch for the price to settle into a tight sideways range after the initial spike. Buying during a consolidated period after the move is generally safer than buying into the spike itself.",
    variant: 'warning'
  },
  "Post-Momentum Consolidation": {
    analysis: "The price is settling after a sharp move up. This is a normal and healthy pause that tends to separate a real trend from a short-lived spike. The asset is absorbing recent gains before deciding its next move.",
    recommendation: "This is a good time to buy or add to your position. Buying during the consolidation phase after a breakout is generally safer than buying into the initial surge. The trend is still intact and the price is giving you a calmer entry point.",
    tip: "If trading activity drops off while the price holds steady, that is a positive sign. It means the selling pressure has dried up. If activity stays high while the price drifts lower, it is worth waiting a little longer to see if the trend holds.",
    variant: 'success'
  },
  "Institutional Dip Absorption": {
    analysis: "The price has dropped well below where it normally sits, and unusually heavy trading activity is flowing through the asset at the same time. A dip of this size attracting this much volume usually means large investors are actively participating at this lower level, either building a position or adding to an existing one.",
    recommendation: "This is a strong buying opportunity. Heavy trading activity at a notable discount is one of the more reliable signs that serious investors are actively buying here. Getting in at the same level rather than waiting for the recovery is generally where the better entry is.",
    tip: "Large investors cannot buy everything they want at once without pushing the price up, so they spread their buying across many transactions over time. A significant dip with heavy volume is often the visible footprint of that process happening in real time.",
    variant: 'success'
  },
};