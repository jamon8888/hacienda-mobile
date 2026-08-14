import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from "react-native";

import needleStore from "@/store/NeedleStore";
import { DOCUMENT_TOOLS } from "@/utils/Needle";
import { showToast } from "@/utils/Notification";

export default function NeedleSpikeView() {
  const [ready, setReady] = useState(needleStore.ready);
  const [busy, setBusy] = useState(needleStore.busy);
  const [logs, setLogs] = useState<string[]>([]);
  const [query, setQuery] = useState("What does the budget say about travel?");

  const log = (message: string) => {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    setLogs(prev => [line, ...prev].slice(0, 100));
    console.log(`[NeedleSpike] ${message}`);
  };

  const handleInit = async () => {
    setBusy(true);
    log("Starting Needle download + init...");
    try {
      await needleStore.init(progress => {
        log(`Download progress: ${Math.round(progress * 100)}%`);
      });
      setReady(needleStore.ready);
      if (needleStore.ready) {
        log("Needle ready");
        showToast("Needle ready");
      } else {
        log(`Needle init failed: ${needleStore.error ?? "unknown"}`);
        showToast("Needle init failed");
      }
    } catch (err) {
      log(`Init error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleRouteRag = async () => {
    if (!needleStore.ready) {
      log("Needle not ready");
      return;
    }
    setBusy(true);
    log(`Routing RAG for: "${query}"`);
    const start = Date.now();
    try {
      const decision = await needleStore.routeRag(query, { maxTopK: 4 });
      log(
        `RAG decision (${Date.now() - start}ms): ${JSON.stringify(decision)}`,
      );
    } catch (err) {
      log(`RAG error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSelectTools = async () => {
    if (!needleStore.ready) {
      log("Needle not ready");
      return;
    }
    setBusy(true);
    log("Selecting tools...");
    const start = Date.now();
    try {
      const selected = await needleStore.selectTools(query, DOCUMENT_TOOLS, 2);
      log(
        `Selected tools (${Date.now() - start}ms): ${selected
          .map(t => t.name)
          .join(", ")}`,
      );
    } catch (err) {
      log(
        `Select tools error: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDestroy = async () => {
    await needleStore.destroy();
    setReady(false);
    log("Needle destroyed");
  };

  return (
    <View className="bg-[--secondary-bg] rounded-xl p-4 mb-4">
      <Text className="text-white text-2xl font-bold mb-4">Needle Spike</Text>

      <View className="flex flex-col gap-y-3">
        <View className="flex flex-row gap-x-2">
          <Text className="text-white">Ready:</Text>
          <Text className={ready ? "text-green-400" : "text-red-400"}>
            {ready ? "YES" : "NO"}
          </Text>
          <Text className="text-white ml-4">Busy:</Text>
          <Text className={busy ? "text-yellow-400" : "text-white"}>
            {busy ? "YES" : "NO"}
          </Text>
        </View>

        <TextInput
          placeholder="Enter a query..."
          placeholderTextColor="#6c757d"
          className="p-4 rounded-lg bg-[--primary-bg] text-white border-none"
          value={query}
          onChangeText={setQuery}
          multiline
          numberOfLines={2}
        />

        <TouchableOpacity
          className="bg-[--cta-light-blue] rounded-lg p-4"
          disabled={busy}
          onPress={handleInit}>
          <Text className="text-[--dark] font-bold text-center">
            1. Download & Init Needle
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-[--cta-light-blue] rounded-lg p-4"
          disabled={busy || !ready}
          onPress={handleRouteRag}>
          <Text className="text-[--dark] font-bold text-center">
            2. Test RAG Routing
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-[--cta-light-blue] rounded-lg p-4"
          disabled={busy || !ready}
          onPress={handleSelectTools}>
          <Text className="text-[--dark] font-bold text-center">
            3. Test Tool Selection
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-red-500 rounded-lg p-4"
          disabled={busy}
          onPress={handleDestroy}>
          <Text className="text-white font-bold text-center">
            Destroy Needle
          </Text>
        </TouchableOpacity>

        <Text className="text-white font-bold mt-2">Logs</Text>
        <ScrollView
          className="bg-[--primary-bg] rounded-lg p-2"
          style={{ maxHeight: 300 }}
          nestedScrollEnabled>
          {logs.length === 0 ? (
            <Text className="text-gray-400">No logs yet</Text>
          ) : (
            logs.map((line, i) => (
              <Text key={i} className="text-gray-300 text-xs mb-1">
                {line}
              </Text>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}
