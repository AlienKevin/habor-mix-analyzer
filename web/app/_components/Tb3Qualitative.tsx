import Link from "next/link";
import type { ReactNode } from "react";

/** Inline link to a cited trial, optionally deep-linking to a trajectory step.
 *  Evidence is grounded: every reference opens the actual rollout. */
function T({ ann, step, children }: { ann: string; step?: number; children: ReactNode }) {
  return (
    <Link
      href={`/tb3/${ann}/${step ? `#step-${step}` : ""}`}
      className="font-mono text-[0.95em] text-indigo-700 no-underline hover:underline"
      title="open the cited trajectory"
    >
      {children}
    </Link>
  );
}

function H({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-semibold text-slate-900">{children}</h3>;
}

/**
 * Condensed qualitative comparison (gpt-5.5 vs claude-opus-4.8) over the 654
 * tb3-preview judge verdicts. Two grounded findings in the DeepSWE register,
 * each grounded in specific, openable trials. (No prior-work comparison; reward
 * hacking is deliberately out of scope here.)
 */
export default function Tb3Qualitative() {
  return (
    <section id="qualitative" className="mt-10 max-w-3xl scroll-mt-4">
      <h2 className="group text-base font-semibold">
        Qualitative comparison: gpt-5.5 vs claude-opus-4.8
        <a href="#qualitative" className="ml-1.5 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100">
          #
        </a>
      </h2>
      <div className="mt-4 space-y-5 text-sm leading-relaxed text-slate-700">
        <article className="space-y-2">
          <H>The head-to-head ledger: Claude wins by honest labor, GPT by structural insight</H>
          <p>
            Across the 109 tasks both families attempt, Claude wins 14 that GPT cannot and GPT wins 7 that Claude cannot,
            and the two win lists barely overlap in character. Claude&rsquo;s exclusive wins cluster on tasks that reward
            grinding the honest path: it writes a real 249,000-character Brainfuck program on{" "}
            <T ann="tb3-43">brainfuck-sigma-gcd</T>, stands up the full mesh on{" "}
            <T ann="tb3-412">service-mesh-certification</T>, and gets the recovery order right on{" "}
            <T ann="tb3-513">wal-recovery-ordering</T>, all clean passes, while GPT scores zero on each (often by taking a
            shortcut the verifier rejects). On the from-scratch Rust compiler{" "}
            <T ann="tb3-402" step={10}>rust-c-compiler</T> Claude builds a comprehensive frontend that clears the 0.97
            gate (reward 0.986) where all three GPT trials wrap an external compiler and score zero. One honest caveat:
            Claude&rsquo;s three rust wins are all partial, clearing the gate but failing held-out edge tests.
          </p>
          <p>
            GPT&rsquo;s exclusive wins cluster on short tasks with a cheap structural key that Claude over-engineers past.
            GPT solves <T ann="tb3-375" step={9}>reassemble-neural-net</T> in 11 steps by sorting blocks on a single
            weight-norm signal, where Claude&rsquo;s two real attempts take 117 and 147 steps and still only reach partial.
            It wins <T ann="tb3-177">ghost-machine</T> in 12 steps, takes <T ann="tb3-476" step={5}>tpm-pcr-forgery</T> in 8
            with one decisive experiment, and finishes <T ann="tb3-284">mp-checkpoint-consolidation</T> where Claude
            over-runs past 100 steps. The dividing line is task type, not difficulty: when the win condition is to do the
            laborious thing correctly, Claude wins; when it is to spot the one trick and stop, GPT wins.
          </p>
        </article>

        <article className="space-y-2">
          <H>The over-persistence tax: Claude takes about twice the steps even on its wins</H>
          <p>
            The cleanest evidence that Claude over-persists is not the loss split but the 16 tasks both families win.
            Comparing only passing trials, Claude takes about twice the steps to reach the same pass (a median-of-medians
            of 34.5 versus 16.5 for GPT), and it is the longer one on 15 of those 16. The gap is wide and consistent
            across task types: <T ann="tb3-140">fix-grpo-reward</T> takes Claude 117 steps to GPT&rsquo;s{" "}
            <T ann="tb3-139">42</T>, <T ann="tb3-128">exam-pdf-eval</T> 126 to <T ann="tb3-127">64</T>,{" "}
            <T ann="tb3-67">cordic-rotator-constrained</T> 95 to <T ann="tb3-69">30</T>,{" "}
            <T ann="tb3-388">ros2-lifecycle-debug</T> 35 to <T ann="tb3-386">15</T>,{" "}
            <T ann="tb3-500">vf2-speedup-networkx</T> 42 to <T ann="tb3-503">18</T>, and{" "}
            <T ann="tb3-24">async-fifo-constrained</T> 32 to <T ann="tb3-20">16</T>. This removes the usual confound: on a
            shared win both families produced a correct artifact, so the extra steps are process overhead, not the cost of
            being more lost or attempting something harder. The step tax is structural to how Claude works, and it is paid
            even when Claude succeeds.
          </p>
        </article>
      </div>
    </section>
  );
}
