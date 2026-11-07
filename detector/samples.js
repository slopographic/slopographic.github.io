/* The Authenticator's sample texts: "Paste genuine slop" cycles through MACHINE, "Paste a counterfeit" through HUMAN.
 * Every machine sample scores as Genuine Slop and every human one under Partial Slop (tests/detector/detector.test.html). */
(function (root) {
  'use strict';
  const S = (root.SlopDetect = root.SlopDetect || {});

  const MACHINE = [
    'I’m thrilled to announce that I’m embarking on a new journey! 🚀\n\nIn today’s fast-paced world, it’s not just about working hard, it’s about working smart.\n\nOver the past year I learned to leverage synergy, foster growth and elevate every conversation.\n\nLet that sink in. 🧠\n\nAgree? #Leadership #Growth #Mindset',
    'Certainly! Great question. It’s important to note that the landscape of home gardening is multifaceted and ever-evolving. Whether you’re a seasoned grower or a curious beginner, tomatoes play a pivotal role in a vibrant garden. Let’s dive in! In conclusion, patience is a testament to the rich tapestry of nature. I hope this helps!',
    'Hi Dana,\n\nI hope this email finds you well. I wanted to reach out because our cutting-edge platform empowers teams like yours to streamline workflows and unlock the full potential of their data. It’s not just a tool, it’s a transformative partner on your journey to seamless success.\n\nWould you be open to a quick 15-minute call? 🙌',
    'Unlock the power of morning routines! ✨ In today’s digital age, a robust routine stands as a beacon of productivity. This comprehensive guide will delve into the intricate art of waking up, showcasing proven strategies that resonate with high performers. Let’s delve into it. 💡🔥',
    '【PREMIUM QUALITY】【SEAMLESS DESIGN】 Elevate your kitchen with this game-changing spatula! Meticulously crafted for the modern chef, it boasts unparalleled flexibility and invaluable durability. Whether you’re a beginner or a pro, it seamlessly navigates every pan. 🎯💯',
    'Here’s the thing.\nMost people scroll past this.\nThe winners don’t.\nThey harness discipline.\nThey foster habits.\nThey embrace the journey.\nRead that again. 👀\nRepost if this resonates. ♻️',
  ];

  const HUMAN = [
    'Took the dog to the vet this morning. She was fine, just ate a sock again. The vet laughed and charged us $180 anyway. On the way home we got stuck behind a tractor for twenty minutes and I listened to the same three songs on repeat.',
    'hey, are you still coming saturday? bring chairs if you have them, we only have like four. also mike says he’s making his chili again so maybe eat before lol',
    'The meeting ran long because nobody could find the projector remote. We eventually gave up and crowded around Dana’s laptop. Budget numbers look fine; the main issue is the vendor still hasn’t sent the revised quote.',
    'I planted tomatoes too early again. Every year I tell myself to wait until May, and every year I don’t. Two of them made it. The rest are a lesson I will absolutely ignore next spring.',
  ];

  S.samples = { MACHINE, HUMAN };
  if (typeof module !== 'undefined' && module.exports) module.exports = S;
})(typeof window !== 'undefined' ? window : globalThis);
