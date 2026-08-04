import { Text, TouchableOpacity, View, ScrollView, Switch } from "react-native";
import SafeView from "@/components/SafeView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Microphone, Cpu, Lightning, Gauge, ShieldWarning, ArrowDown, Check, Info } from "phosphor-react-native";
import { useNavigation } from "@react-navigation/native";
import { PATHS } from "@/utils/paths";
import uiStore from "@/store/UIStore";
import { useEffect, useState } from "react";
import { CACTUS_VOICE_MODELS, CactusVoiceModelId, DEFAULT_CACTUS_ASR_MODEL, DEFAULT_CACTUS_LLM_MODEL } from "@/utils/models/defaults";
import { useDeviceCapabilities } from "@/hooks/useDeviceCapabilities";
import { CACTUS_VOICE_MODELS as VOICE_MODELS } from "@/utils/models/defaults";
import { ModelPickerModal } from "./VoiceSettings/ModalPicker";

type VoiceModelCategory = 'asr' | 'llm';

interface VoiceModelOption {
    id: CactusVoiceModelId;
    name: string;
    description: string;
    size: string;
    category: VoiceModelCategory;
    recommendedFor: string[];
    quantization: string;
}

const ASR_MODEL_OPTIONS: VoiceModelOption[] = [
    {
        id: 'parakeet-tdt-0.6b-cq2',
        name: 'Parakeet TDT 0.6B (CQ2)',
        description: 'Best balance - 180MB, WER 0.147',
        size: '180MB',
        category: 'asr',
        recommendedFor: ['low', 'medium', 'high'],
        quantization: 'CQ2',
    },
    {
        id: 'parakeet-tdt-0.6b-cq3',
        name: 'Parakeet TDT 0.6B (CQ3)',
        description: 'Higher accuracy - 250MB, WER 0.115',
        size: '250MB',
        category: 'asr',
        recommendedFor: ['medium', 'high'],
        quantization: 'CQ3',
    },
    {
        id: 'parakeet-tdt-0.6b-cq4',
        name: 'Parakeet TDT 0.6B (CQ4)',
        description: 'Best accuracy - 384MB, WER 0.115',
        size: '384MB',
        category: 'asr',
        recommendedFor: ['high'],
        quantization: 'CQ4',
    },
];

const LLM_MODEL_OPTIONS: VoiceModelOption[] = [
    {
        id: 'gemma-4-e2b-hybrid-cq2',
        name: 'Gemma 4 E2B Hybrid (CQ2)',
        description: 'Smallest - ~400MB, basic quality',
        size: '~400MB',
        category: 'llm',
        recommendedFor: ['low'],
        quantization: 'CQ2',
    },
    {
        id: 'gemma-4-e2b-hybrid-cq2.54',
        name: 'Gemma 4 E2B Hybrid (CQ2.54)',
        description: 'Production bundle - 650MB, balanced',
        size: '650MB',
        category: 'llm',
        recommendedFor: ['low', 'medium'],
        quantization: 'CQ2.54',
    },
    {
        id: 'gemma-4-e2b-hybrid-cq4',
        name: 'Gemma 4 E2B Hybrid (CQ4)',
        description: 'Best quality - 1.2GB, highest accuracy',
        size: '1.2GB',
        category: 'llm',
        recommendedFor: ['high'],
        quantization: 'CQ4',
    },
];

const DEFAULT_ASR_MODEL: CactusVoiceModelId = 'parakeet-tdt-0.6b-cq2';
const DEFAULT_LLM_MODEL: CactusVoiceModelId = 'gemma-4-e2b-hybrid-cq2.54';

interface StoredVoiceSettings {
    asrModel?: CactusVoiceModelId;
    llmModel?: CactusVoiceModelId;
    confidenceThreshold?: number;
    autoHandoff?: boolean;
    processingDelay?: number;
    enableTTS?: boolean;
    vadThreshold?: number;
}

export function VoiceSettingsView({ workspace, goToPage }: any) {
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const deviceCaps = useDeviceCapabilities();

    const [asrModel, setAsrModel] = useState<CactusVoiceModelId>(DEFAULT_ASR_MODEL);
    const [llmModel, setLlmModel] = useState<CactusVoiceModelId>(DEFAULT_LLM_MODEL);
    const [confidenceThreshold, setConfidenceThreshold] = useState(0.7);
    const [autoHandoff, setAutoHandoff] = useState(true);
    const [processingDelay, setProcessingDelay] = useState(50);
    const [enableTTS, setEnableTTS] = useState(true);
    const [vadThreshold, setVadThreshold] = useState(0.5);
    const [showAsrPicker, setShowAsrPicker] = useState(false);
    const [showLlmPicker, setShowLlmPicker] = useState(false);

    // Load saved preferences
    useEffect(() => {
        const loadSettings = async () => {
            const saved = await uiStore.getFromStorage<StoredVoiceSettings>('voiceSettings', {});
            if (saved.asrModel) setAsrModel(saved.asrModel);
            if (saved.llmModel) setLlmModel(saved.llmModel);
            if (saved.confidenceThreshold !== undefined) setConfidenceThreshold(saved.confidenceThreshold);
            if (saved.autoHandoff !== undefined) setAutoHandoff(saved.autoHandoff);
            if (saved.processingDelay !== undefined) setProcessingDelay(saved.processingDelay);
            if (saved.enableTTS !== undefined) setEnableTTS(saved.enableTTS);
            if (saved.vadThreshold !== undefined) setVadThreshold(saved.vadThreshold);
        };
        loadSettings();
    }, []);

    // Save preferences
    const saveSettings = async () => {
        const settings = {
            asrModel,
            llmModel,
            confidenceThreshold,
            autoHandoff,
            processingDelay,
            enableTTS,
            vadThreshold,
        };
        await uiStore.setToStorage('voiceSettings', settings);
        uiStore.showError('Voice settings saved');
    };

    const getRecommendedBadge = (model: VoiceModelOption) => {
        if (!deviceCaps) return false;
        const ramTier = deviceCaps.ramTier;
        return model.recommendedFor.includes(ramTier);
    };

    const getRamTierLabel = () => {
        if (!deviceCaps) return 'Unknown';
        return deviceCaps.ramTier.charAt(0).toUpperCase() + deviceCaps.ramTier.slice(1);
    };

    const getNPULabel = () => {
        if (!deviceCaps) return 'Unknown';
        if (deviceCaps.npuBackend !== 'CPU' && deviceCaps.npuBackend !== 'NNAPI') {
            return `${deviceCaps.npuBackend} ✓`;
        }
        return 'CPU Only';
    };

    const asrModelOption = ASR_MODEL_OPTIONS.find(m => m.id === asrModel);
    const llmModelOption = LLM_MODEL_OPTIONS.find(m => m.id === llmModel);

    return (
        <SafeView
            scrollable={false}
            safeAreaClassNames="pt-[21px]"
            containerClassNames="flex-1 flex flex-col"
            safeAreaStyle={{ backgroundColor: '#1B1B1E' }}
        >
            {/* Header */}
            <View style={{ paddingHorizontal: 30, paddingTop: insets.top, paddingBottom: 20 }} className="w-full flex flex-row items-center justify-center relative">
                <TouchableOpacity onPress={() => goToPage('main')} className="absolute left-0 flex flex-row items-center gap-2">
                    <ArrowLeft size={24} color="#FFF" weight="bold" />
                </TouchableOpacity>
                <Text style={{ maxWidth: '80%' }} numberOfLines={1} ellipsizeMode="middle" className="text-white text-lg font-medium">Voice Settings</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="flex flex-col" contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 100, gap: 24, backgroundColor: '#1B1B1E' }}>
                {/* Device Info Section */}
                <View className="w-full flex flex-col" style={{ gap: 12 }}>
                    <Text style={{ color: '#9F9FA0' }} className="text-sm uppercase">Device Capabilities</Text>
                    <View className="flex flex-row flex-wrap gap-2">
                        <View className="bg-[#27282A] px-4 py-2 rounded-lg border border-[#3A3B3D]">
                            <Text className="text-white/60 text-xs uppercase">RAM Tier</Text>
                            <Text className="text-white text-base font-medium">{getRamTierLabel()}</Text>
                        </View>
                        <View className="bg-[#27282A] px-4 py-2 rounded-lg border border-[#3A3B3D]">
                            <Text className="text-white/60 text-xs uppercase">NPU</Text>
                            <Text className="text-white text-base font-medium">{getNPULabel()}</Text>
                        </View>
                        <View className="bg-[#27282A] px-4 py-2 rounded-lg border border-[#3A3B3D]">
                            <Text className="text-white/60 text-xs uppercase">Available RAM</Text>
                            <Text className="text-white text-base font-medium">
                                {deviceCaps?.availableRAM === undefined
                                    ? 'Unknown'
                                    : `${(deviceCaps.availableRAM / (1024 ** 3)).toFixed(1)} GB`}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* ASR Model Selection */}
                <View className="w-full flex flex-col" style={{ gap: 12 }}>
                    <View className="flex flex-row items-center justify-between">
                        <Text style={{ color: '#9F9FA0' }} className="text-sm uppercase">Speech Recognition (ASR)</Text>
                        <Info size={18} color="#6F6F71" />
                    </View>
                    <TouchableOpacity
                        style={{ backgroundColor: '#27282A', padding: 14, gap: 20 }}
                        className="w-full flex flex-row items-center rounded-lg"
                        onPress={() => setShowAsrPicker(true)}
                    >
                        <View className="flex flex-row gap-2 items-center">
                            <Microphone size={18} color="#FFF" />
                            <Text className="text-white text-lg">ASR Model</Text>
                        </View>
                        <View className="flex flex-1 flex-row gap-2 items-center justify-between">
                            <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: '#9F9FA0' }} className="text-lg flex-1 text-right">
                                {asrModelOption?.name || asrModel}
                            </Text>
                            <ArrowDown size={20} color="#9F9FA0" />
                        </View>
                    </TouchableOpacity>
                </View>

                {/* LLM Model Selection */}
                <View className="w-full flex flex-col" style={{ gap: 12 }}>
                    <View className="flex flex-row items-center justify-between">
                        <Text style={{ color: '#9F9FA0' }} className="text-sm uppercase">Language Model (LLM)</Text>
                        <Info size={18} color="#6F6F71" />
                    </View>
                    <TouchableOpacity
                        style={{ backgroundColor: '#27282A', padding: 14, gap: 20 }}
                        className="w-full flex flex-row items-center rounded-lg"
                        onPress={() => setShowLlmPicker(true)}
                    >
                        <View className="flex flex-row gap-2 items-center">
                            <Cpu size={18} color="#FFF" />
                            <Text className="text-white text-lg">LLM Model</Text>
                        </View>
                        <View className="flex flex-1 flex-row gap-2 items-center justify-between">
                            <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: '#9F9FA0' }} className="text-lg flex-1 text-right">
                                {llmModelOption?.name || llmModel}
                            </Text>
                            <ArrowDown size={20} color="#9F9FA0" />
                        </View>
                    </TouchableOpacity>
                </View>

                {/* Advanced Settings */}
                <View className="w-full flex flex-col" style={{ gap: 12 }}>
                    <Text style={{ color: '#9F9FA0' }} className="text-sm uppercase">Advanced Settings</Text>

                    {/* Confidence Threshold */}
                    <View className="w-full flex flex-col" style={{ gap: 8 }}>
                        <View className="flex flex-row items-center justify-between">
                            <Text className="text-white text-base">Confidence Threshold</Text>
                            <Text className="text-white/60 text-sm">
                                {(confidenceThreshold * 100).toFixed(0)}%
                            </Text>
                        </View>
                        <View className="flex flex-row items-center gap-2">
                            <Text className="text-white/60 text-sm w-[30px]">50%</Text>
                            <View className="flex-1 h-2 bg-[#3A3B3D] rounded-full relative">
                                <View
                                    style={{
                                        position: 'absolute',
                                        left: 0,
                                        top: 0,
                                        bottom: 0,
                                        width: `${confidenceThreshold * 100}%`,
                                        backgroundColor: '#3B82F6',
                                        borderRadius: 9999,
                                    }}
                                />
                            </View>
                            <Text className="text-white/60 text-sm w-[30px] text-right">90%</Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => setConfidenceThreshold(Math.min(0.9, confidenceThreshold + 0.05))}
                            className="bg-[#27282A] px-3 py-1 rounded"
                        >
                            <Text className="text-white text-xs">+</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setConfidenceThreshold(Math.max(0.5, confidenceThreshold - 0.05))}
                            className="bg-[#27282A] px-3 py-1 rounded"
                        >
                            <Text className="text-white text-xs">-</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Auto Handoff */}
                    <View className="flex flex-row items-center justify-between">
                        <View className="flex flex-col gap-1">
                            <Text className="text-white text-base">Cloud Handoff</Text>
                            <Text className="text-white/60 text-sm">
                                Route low-confidence queries to cloud
                            </Text>
                        </View>
                        <Switch
                            value={autoHandoff}
                            onValueChange={setAutoHandoff}
                            trackColor={{ false: '#3A3B3D', true: '#3B82F6' }}
                            thumbColor={autoHandoff ? '#3B82F6' : '#FFF'}
                        />
                    </View>

                    {/* Processing Delay */}
                    <View className="flex flex-row items-center justify-between">
                        <View className="flex flex-col gap-1">
                            <Text className="text-white text-base">Processing Delay</Text>
                            <Text className="text-white/60 text-sm">
                                {processingDelay}ms between turns
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => setProcessingDelay(Math.max(0, processingDelay - 25))}
                            className="bg-[#27282A] px-3 py-1 rounded"
                        >
                            <Text className="text-white text-xs">-</Text>
                        </TouchableOpacity>
                        <Text className="text-white text-base w-[50px] text-center">{processingDelay}ms</Text>
                        <TouchableOpacity
                            onPress={() => setProcessingDelay(Math.min(200, processingDelay + 25))}
                            className="bg-[#27282A] px-3 py-1 rounded"
                        >
                            <Text className="text-white text-xs">+</Text>
                        </TouchableOpacity>
                    </View>

                    {/* VAD Threshold */}
                    <View className="flex flex-row items-center justify-between">
                        <View className="flex flex-col gap-1">
                            <Text className="text-white text-base">VAD Sensitivity</Text>
                            <Text className="text-white/60 text-sm">
                                Speech detection threshold
                            </Text>
                        </View>
                        <Switch
                            value={vadThreshold > 0.5}
                            onValueChange={(v) => setVadThreshold(v ? 0.7 : 0.3)}
                            trackColor={{ false: '#3A3B3D', true: '#3B82F6' }}
                            thumbColor={vadThreshold > 0.5 ? '#3B82F6' : '#FFF'}
                        />
                    </View>

                    {/* Enable TTS */}
                    <View className="flex flex-row items-center justify-between">
                        <View className="flex flex-col gap-1">
                            <Text className="text-white text-base">Text-to-Speech</Text>
                            <Text className="text-white/60 text-sm">
                                Speak responses aloud
                            </Text>
                        </View>
                        <Switch
                            value={enableTTS}
                            onValueChange={setEnableTTS}
                            trackColor={{ false: '#3A3B3D', true: '#3B82F6' }}
                            thumbColor={enableTTS ? '#3B82F6' : '#FFF'}
                        />
                    </View>
                </View>

                {/* Save Button */}
                <TouchableOpacity
                    onPress={saveSettings}
                    style={{ backgroundColor: '#3B82F6', padding: 14 }}
                    className='rounded-lg items-center'
                >
                    <Text className='text-white text-base font-medium'>Save Voice Settings</Text>
                </TouchableOpacity>
            </ScrollView>

            {/* ASR Model Picker Modal */}
            {showAsrPicker && (
                <ModelPickerModal
                    title="Select ASR Model"
                    models={ASR_MODEL_OPTIONS}
                    selectedModel={asrModel}
                    onSelect={setAsrModel}
                    onClose={() => setShowAsrPicker(false)}
                    deviceCaps={deviceCaps}
                    isRecommended={getRecommendedBadge}
                />
            )}

            {/* LLM Model Picker Modal */}
            {showLlmPicker && (
                <ModelPickerModal
                    title="Select LLM Model"
                    models={LLM_MODEL_OPTIONS}
                    selectedModel={llmModel}
                    onSelect={setLlmModel}
                    onClose={() => setShowLlmPicker(false)}
                    deviceCaps={deviceCaps}
                    isRecommended={getRecommendedBadge}
                />
            )}
        </SafeView>
    );
}