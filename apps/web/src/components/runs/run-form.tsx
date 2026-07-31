"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { CheckCircle2, FlaskConical, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useCreateRun, useOllamaStatus } from "@/lib/queries";
import {
  DEMO_COUNT_OPTIONS,
  METRIC_OPTIONS,
  MODEL_OPTIONS,
  OPTIMIZER_OPTIONS,
  TASK_OPTIONS,
} from "@/lib/run-format";

const schema = z.object({
  label: z.string().min(1, "Give this run a label").max(120),
  task: z.enum(["support_ticket_category"]),
  optimizer: z.enum([
    "BootstrapFewShot",
    "BootstrapFewShotWithRandomSearch",
    "LabeledFewShot",
  ]),
  model: z.string().min(1, "Pick a model"),
  metric: z.enum(["exact_match"]),
  max_bootstrapped_demos: z.string(),
  max_labeled_demos: z.string(),
  notes: z.string().max(1000).optional(),
});

type RunFormValues = z.infer<typeof schema>;

const DEFAULTS: RunFormValues = {
  label: "",
  task: "support_ticket_category",
  optimizer: "BootstrapFewShot",
  model: "llama3.2",
  metric: "exact_match",
  max_bootstrapped_demos: "2",
  max_labeled_demos: "2",
  notes: "",
};

export function RunForm() {
  const router = useRouter();
  const { data: ollama } = useOllamaStatus();
  const createRun = useCreateRun();

  // Merge the app's configured default model in first so it is always
  // selectable, even if it isn't one of the hard-coded common tags.
  const modelOptions = useMemo(() => {
    const base = [...MODEL_OPTIONS] as string[];
    const configured = ollama?.configured_model;
    if (configured && !base.includes(configured)) base.unshift(configured);
    return base;
  }, [ollama?.configured_model]);

  const form = useForm<RunFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      ...DEFAULTS,
      model: ollama?.configured_model ?? DEFAULTS.model,
    },
  });

  // `defaultValues` is captured at mount, before `useOllamaStatus()` resolves,
  // so `model` falls back to the hard-coded DEFAULTS.model ("llama3.2"). Once
  // the status arrives, sync the field to the actually configured/pulled model
  // so accepting the form's defaults launches a run that actually runs. Skip
  // once the user has picked a model themselves so a manual choice stays sticky.
  const configuredModel = ollama?.configured_model;
  const modelIsDirty = form.formState.dirtyFields.model;
  useEffect(() => {
    if (configuredModel && !modelIsDirty) {
      form.setValue("model", configuredModel);
    }
  }, [configuredModel, modelIsDirty, form]);

  const onSubmit = (values: RunFormValues) => {
    createRun.mutate(
      {
        label: values.label,
        task: values.task,
        optimizer: values.optimizer,
        model: values.model,
        metric: values.metric,
        max_bootstrapped_demos: Number(values.max_bootstrapped_demos),
        max_labeled_demos: Number(values.max_labeled_demos),
        notes: values.notes ?? "",
      },
      {
        onSuccess: (res) => {
          toast.success("Run launched", {
            description: "Compiling against your local model. Follow its progress here.",
          });
          router.push(`/runs/${res.run_id}`);
        },
        onError: (err) => {
          toast.error("Could not launch run", {
            description: err instanceof Error ? err.message : "Unknown error",
          });
        },
      },
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {ollama && (
          <Alert variant={ollama.reachable && ollama.model_pulled ? "default" : "destructive"}>
            {ollama.reachable && ollama.model_pulled ? <CheckCircle2 /> : <TriangleAlert />}
            <AlertTitle>
              {ollama.reachable && ollama.model_pulled
                ? "Local Ollama is ready"
                : "Local Ollama needs attention"}
            </AlertTitle>
            <AlertDescription>{ollama.message}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader className="border-b border-border py-4 px-5">
            <CardTitle className="card-title">New optimization run</CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-6">
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Label</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. bootstrap baseline v1" {...field} />
                  </FormControl>
                  <FormDescription>
                    A human name for this compiled version — shown in the Runs Library.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="task"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Task</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full sm:w-96">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TASK_OPTIONS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    A small bundled classification task with a seed train/dev set — a
                    one-click, sound demo run. No dataset to author.
                  </FormDescription>
                </FormItem>
              )}
            />

            <div className="grid gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="optimizer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Optimizer</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {OPTIMIZER_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      BootstrapFewShot is a safe default.
                    </FormDescription>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="model"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ollama model</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {modelOptions.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Runs locally via Ollama. Use a small tag (e.g. llama3.2:1b) for
                      the fastest demo.
                    </FormDescription>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="metric"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Metric</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {METRIC_OPTIONS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Scores the held-out dev set before and after compilation.
                    </FormDescription>
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="max_bootstrapped_demos"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bootstrapped demos</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {DEMO_COUNT_OPTIONS.map((n) => (
                            <SelectItem key={n} value={String(n)}>
                              {n}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>Default 2.</FormDescription>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="max_labeled_demos"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Labeled demos</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {DEMO_COUNT_OPTIONS.map((n) => (
                            <SelectItem key={n} value={String(n)}>
                              {n}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>Default 2.</FormDescription>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Why this run? What are you testing?"
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/runs")}>
            Cancel
          </Button>
          <Button type="submit" disabled={createRun.isPending}>
            <FlaskConical className="h-3.5 w-3.5" />
            {createRun.isPending ? "Launching..." : "Compile & version"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
