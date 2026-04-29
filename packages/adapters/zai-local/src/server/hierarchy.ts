/**
 * Hierarchical Dispatcher - Opus → Sonnet → GLM
 *
 * Implements the orchestration system where:
 * - Opus: Makes strategic decisions, analyzes tasks, and delegates
 * - Sonnet: Prepares instructions, supervises GLM execution, validates results
 * - GLM: Executes concrete tasks (code writing, implementation)
 */

import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import { asString } from "@paperclipai/adapter-utils/server-utils";

interface HierarchyConfig {
  enableHierarchy: boolean;
  opusModel: string;
  sonnetModel: string;
  glmModel: string;
  enableParallelExecution: boolean;
}

interface TaskAnalysis {
  complexity: "simple" | "medium" | "complex";
  taskType: "implementation" | "analysis" | "review";
  estimatedDuration: number; // in seconds
  requiresVision: boolean;
  requiresWebSearch: boolean;
  estimatedTokens: {
    input: number;
    output: number;
  };
}

interface ExecutionPlan {
  steps: ExecutionStep[];
  dependencies: number[][]; // step[i] depends on steps[dependencies[i]]
  totalEstimatedDuration: number;
}

interface ExecutionStep {
  id: number;
  executor: "opus" | "sonnet" | "glm";
  model: string;
  description: string;
  estimatedDuration: number;
  tier: "paid" | "free";
}

/**
 * Analyze a task to determine its characteristics and optimal execution path
 */
export async function analyzeTask(
  prompt: string,
  context: unknown,
  config: HierarchyConfig
): Promise<TaskAnalysis> {
  // For now, use heuristics. In production, this could use a small model
  // or pattern matching to classify tasks

  const promptLower = prompt.toLowerCase();
  const length = prompt.length;

  // Determine complexity based on prompt characteristics
  let complexity: TaskAnalysis["complexity"] = "simple";
  if (length > 1000 ||
      promptLower.includes("architect") ||
      promptLower.includes("design") ||
      promptLower.includes("strategy")) {
    complexity = "complex";
  } else if (length > 500 ||
             promptLower.includes("implement") ||
             promptLower.includes("feature")) {
    complexity = "medium";
  }

  // Determine task type
  let taskType: TaskAnalysis["taskType"] = "implementation";
  if (promptLower.includes("review") ||
      promptLower.includes("validate") ||
      promptLower.includes("check")) {
    taskType = "review";
  } else if (promptLower.includes("analyze") ||
             promptLower.includes("research") ||
             promptLower.includes("investigate")) {
    taskType = "analysis";
  }

  // Check for special requirements
  const requiresVision = promptLower.includes("image") ||
                          promptLower.includes("screenshot") ||
                          promptLower.includes("visual");

  const requiresWebSearch = promptLower.includes("search") ||
                            promptLower.includes("find") ||
                            promptLower.includes("lookup");

  // Estimate tokens based on prompt length and complexity
  const inputTokens = Math.max(1000, Math.min(length * 2, 32000));
  const outputMultiplier = {
    simple: 0.5,
    medium: 1.0,
    complex: 2.0
  }[complexity];
  const outputTokens = inputTokens * outputMultiplier;

  // Estimate duration
  const baseDuration = {
    simple: 10,
    medium: 30,
    complex: 60
  }[complexity];
  const estimatedDuration = baseDuration * (1 + (requiresVision || requiresWebSearch ? 0.5 : 0));

  return {
    complexity,
    taskType,
    estimatedDuration,
    requiresVision,
    requiresWebSearch,
    estimatedTokens: {
      input: inputTokens,
      output: outputTokens
    }
  };
}

/**
 * Create an execution plan based on task analysis
 */
export function createExecutionPlan(
  analysis: TaskAnalysis,
  config: HierarchyConfig
): ExecutionPlan {
  const steps: ExecutionStep[] = [];

  // Rule-based assignment based on task characteristics
  if (analysis.complexity === "complex" || analysis.requiresVision || analysis.requiresWebSearch) {
    // Complex tasks or tasks requiring special capabilities go to Opus
    steps.push({
      id: 0,
      executor: "opus",
      model: config.opusModel,
      description: "Analyze and decompose complex task",
      estimatedDuration: Math.ceil(analysis.estimatedDuration * 0.3),
      tier: "paid"
    });

    // Sonnet prepares instructions for GLM
    steps.push({
      id: 1,
      executor: "sonnet",
      model: config.sonnetModel,
      description: "Prepare detailed implementation instructions",
      estimatedDuration: Math.ceil(analysis.estimatedDuration * 0.2),
      tier: config.enableParallelExecution ? "sonnet" as any : "paid" as any
    });

    // GLM executes the implementation
    steps.push({
      id: 2,
      executor: "glm",
      model: config.glmModel,
      description: "Execute implementation tasks",
      estimatedDuration: Math.ceil(analysis.estimatedDuration * 0.5),
      tier: analysis.complexity === "complex" ? "paid" : "free"
    });
  } else if (analysis.complexity === "medium") {
    // Medium tasks: Sonnet → GLM
    steps.push({
      id: 0,
      executor: "sonnet",
      model: config.sonnetModel,
      description: "Prepare task instructions",
      estimatedDuration: Math.ceil(analysis.estimatedDuration * 0.4),
      tier: "paid"
    });

    steps.push({
      id: 1,
      executor: "glm",
      model: config.glmModel,
      description: "Execute task",
      estimatedDuration: Math.ceil(analysis.estimatedDuration * 0.6),
      tier: "free"
    });
  } else {
    // Simple tasks: Direct to GLM
    steps.push({
      id: 0,
      executor: "glm",
      model: config.glmModel,
      description: "Execute simple task",
      estimatedDuration: analysis.estimatedDuration,
      tier: "free"
    });
  }

  // Define dependencies (sequential execution for now)
  const dependencies: number[][] = [];
  for (let i = 1; i < steps.length; i++) {
    dependencies.push([i - 1]);
  }
  if (steps.length > 0) {
    dependencies.push([]); // First step has no dependencies
  }

  const totalEstimatedDuration = steps.reduce((sum, step) => sum + step.estimatedDuration, 0);

  return {
    steps,
    dependencies,
    totalEstimatedDuration
  };
}

/**
 * Execute a hierarchical task with the given plan
 */
export async function executeHierarchically(
  ctx: AdapterExecutionContext,
  plan: ExecutionPlan,
  config: HierarchyConfig,
  onStepStart?: (step: ExecutionStep) => void,
  onStepComplete?: (step: ExecutionStep, result: AdapterExecutionResult) => void
): Promise<AdapterExecutionResult> {
  const results: AdapterExecutionResult[] = [];
  let finalResult: AdapterExecutionResult | null = null;

  // Execute steps in order (sequential for now, could be parallel with dependencies)
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];

    if (onStepStart) {
      onStepStart(step);
    }

    // Prepare context for this step
    const stepContext = {
      ...ctx,
      // Add previous results as context
      context: {
        ...ctx.context,
        hierarchyStep: i,
        totalSteps: plan.steps.length,
        previousResults: results.slice(-2), // Only last 2 to avoid bloat
        currentPlan: plan
      }
    };

    // Modify config for this step
    const stepConfig = {
      ...ctx.config,
      model: step.model,
      // Add step-specific instructions
      systemPrompt: asString(ctx.config.systemPrompt, "") +
        `\n\n[HIERARCHICAL EXECUTION - Step ${i + 1}/${plan.steps.length}]\n` +
        `Executor: ${step.executor.toUpperCase()}\n` +
        `Task: ${step.description}`
    };

    try {
      // Execute the step
      // Note: In a real implementation, we would delegate to the appropriate executor
      // For now, we simulate the execution
      const result = await simulateStepExecution(step, stepConfig, stepContext);
      results.push(result);

      if (onStepComplete) {
        onStepComplete(step, result);
      }

      // If this is the last step, use it as the final result
      if (i === plan.steps.length - 1) {
        finalResult = result;
      }

      // If any step fails, abort the hierarchy
      if (result.exitCode !== 0) {
        return {
          exitCode: 1,
          signal: null,
          timedOut: false,
          errorMessage: `Hierarchical execution failed at step ${i + 1} (${step.description}): ${result.errorMessage}`,
          errorCode: "hierarchical_execution_failed"
        };
      }
    } catch (err) {
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: `Error executing step ${i + 1}: ${err instanceof Error ? err.message : String(err)}`,
        errorCode: "hierarchical_step_error"
      };
    }
  }

  return finalResult || {
    exitCode: 0,
    signal: null,
    timedOut: false,
    summary: "Hierarchical execution completed successfully"
  };
}

/**
 * Simulate step execution (would be replaced with actual executor calls)
 */
async function simulateStepExecution(
  step: ExecutionStep,
  config: any,
  context: AdapterExecutionContext
): Promise<AdapterExecutionResult> {
  // In a real implementation, this would:
  // 1. For Opus: Call Claude Opus API with vision/web capabilities
  // 2. For Sonnet: Call Claude Sonnet API with supervision instructions
  // 3. For GLM: Call the ZAI API as implemented in execute.ts

  // For simulation, just return success
  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    usage: {
      inputTokens: Math.floor(Math.random() * 1000) + 500,
      outputTokens: Math.floor(Math.random() * 2000) + 500
    },
    provider: "zai",
    biller: "zai",
    model: step.model,
    billingType: "api",
    costUsd: 0.01,
    resultJson: {
      stepId: step.id,
      executor: step.executor,
      content: `Simulated execution of ${step.description}`
    },
    summary: `Completed ${step.description}`
  };
}

/**
 * Parse hierarchy configuration from adapter config
 */
export function parseHierarchyConfig(config: Record<string, unknown>): HierarchyConfig {
  return {
    enableHierarchy: config.enableHierarchy === true,
    opusModel: asString(config.opusModel, "glm-5.1"),
    sonnetModel: asString(config.sonnetModel, "glm-4.7"),
    glmModel: asString(config.glmModel, "glm-4.7-flash"),
    enableParallelExecution: config.enableParallelExecution === true
  };
}