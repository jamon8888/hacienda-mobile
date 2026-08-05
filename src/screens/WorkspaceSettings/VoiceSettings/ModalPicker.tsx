import React, { useCallback, useEffect, useRef, useState } from "react";
import { BottomSheetBackdrop, BottomSheetBackdropProps, BottomSheetModal } from '@gorhom/bottom-sheet';
import { useBottomSheet, BOTTOM_SHEET_NAMES } from '@/contexts/BottomSheetContext';
import { View, Text, TouchableOpacity, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Radio, Check, CaretDown } from "phosphor-react-native";
import { CactusVoiceModelId } from "@/utils/models/defaults";

interface VoiceModelOption {
    id: CactusVoiceModelId;
    name: string;
    description: string;
    size: string;
    category: 'asr' | 'llm';
    recommendedFor: string[];
    quantization: string;
}

interface ModelPickerModalProps {
    title: string;
    models: VoiceModelOption[];
    selectedModel: CactusVoiceModelId;
    onSelect: (modelId: CactusVoiceModelId) => void;
    onClose: () => void;
    deviceCaps: any;
    isRecommended: (model: VoiceModelOption) => boolean;
}

export function ModelPickerModal({
    title,
    models,
    selectedModel,
    onSelect,
    onClose,
    deviceCaps,
    isRecommended,
}: ModelPickerModalProps) {
    const insets = useSafeAreaInsets();
    const bottomSheetRef = useRef<any>(null);
    const { registerSheet, dismissSheet } = useBottomSheet();

    const renderBackdrop = useCallback(
        (props: BottomSheetBackdropProps) => (
            <BottomSheetBackdrop
                {...props}
                disappearsOnIndex={-1}
                appearsOnIndex={0}
                opacity={0.7}
            />
        ),
        []
    );

    useEffect(() => {
        registerSheet(BOTTOM_SHEET_NAMES.TRANSCRIPTION_OPTIONS, bottomSheetRef);
    }, [registerSheet]);

    const renderItem = ({ item }: { item: VoiceModelOption }) => {
        const isSelected = selectedModel === item.id;
        const recommended = isRecommended(item);
        
        return (
            <TouchableOpacity
                onPress={() => {
                    onSelect(item.id);
                    bottomSheetRef.current?.dismiss();
                }}
                style={{
                    backgroundColor: isSelected ? '#7cd4fd65' : 'rgba(255, 255, 255, 0.1)',
                    padding: 16,
                    marginBottom: 8,
                    borderRadius: 8,
                    borderWidth: isSelected ? 2 : 0,
                    borderColor: isSelected ? '#3B82F6' : 'transparent',
                }}
                className='flex flex-row items-center justify-between'
            >
                <View className='flex-1'>
                    <View className="flex flex-row gap-2 items-center">
                        <Text className='text-white text-base'>{item.name}</Text>
                        {recommended && (
                            <View className="bg-emerald-500 px-2 py-0.5 rounded">
                                <Text className="text-white text-xs font-medium">Recommended</Text>
                            </View>
                        )}
                    </View>
                    <Text style={{ color: '#9F9FA0' }} className='text-xs'>{item.description} | {item.size}</Text>
                </View>
                <View className="flex flex-row items-center gap-2">
                    <Check size={20} color={isSelected ? '#3B82F6' : '#9F9FA0'} weight="fill" />
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <BottomSheetModal
            ref={bottomSheetRef}
            index={0}
            snapPoints={['90%']}
            enableDynamicSizing={false}
            enablePanDownToClose={true}
            backdropComponent={renderBackdrop}
            backgroundStyle={{ backgroundColor: '#1B1B1E' }}
            handleIndicatorStyle={{ backgroundColor: '#9F9FA0', width: 45, margin: 10 }}
            onDismiss={onClose}
        >
            <View style={{ paddingHorizontal: 30, paddingBottom: 20, paddingTop: 10 }}>
                <View className='flex flex-row items-center justify-between mb-4'>
                    <Text className='text-white text-xl font-medium'>{title}</Text>
                    <TouchableOpacity onPress={onClose}>
                        <CaretDown size={24} color="#FFF" />
                    </TouchableOpacity>
                </View>
                <FlatList
                    data={models}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{ paddingBottom: 20, gap: 8 }}
                    showsVerticalScrollIndicator={false}
                />
            </View>
        </BottomSheetModal>
    );
}