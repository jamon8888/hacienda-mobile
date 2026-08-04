import { Text, TouchableOpacity, View, ScrollView, Alert } from "react-native";
import SafeView from "@/components/SafeView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, FolderOpen } from "phosphor-react-native";
import uiStore from "@/store/UIStore";
import type { IWorkspacePageKey } from "./index";
import { useBottomSheet, BOTTOM_SHEET_NAMES } from "@/contexts/BottomSheetContext";
import VectorDB from "@/utils/VectorDB";
import Document from "@/database/models/Document";
import { showToast } from "@/utils/Notification";

interface DocumentsSettingsProps {
    workspace: any;
    goToPage: (page: IWorkspacePageKey) => void;
    initialThreadSlug?: string | null;
}

export function DocumentsSettingsView({ workspace, goToPage }: DocumentsSettingsProps) {
    const insets = useSafeAreaInsets();
    const { presentSheet } = useBottomSheet();

    function handleImportPress() {
        presentSheet(BOTTOM_SHEET_NAMES.WORKSPACE_FILES);
    }

    function handleClearAll() {
        Alert.alert(
            'Clear All Documents',
            'Are you sure you want to clear all documents? This will remove all vectors and cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: onClearAll },
            ]
        );
    }

    async function onClearAll() {
        try {
            await VectorDB.resetVectorsForWorkspace(workspace.slug);
            await Document.delete([{ field: 'workspace_slug', value: workspace.slug }]);
            showToast('All documents cleared');
        } catch (e) {
            console.error('Failed to clear documents:', e);
            uiStore.showError('Failed to clear documents');
        }
    }

    return (
        <SafeView
            scrollable={false}
            safeAreaClassNames="pt-[21px]"
            containerClassNames="flex-1 flex flex-col"
            safeAreaStyle={{ backgroundColor: '#1B1B1E' }}
        >
            <View style={{ paddingHorizontal: 30, paddingTop: insets.top, paddingBottom: 20 }}
                className="w-full flex flex-row items-center justify-center relative">
                <TouchableOpacity onPress={() => goToPage('main')} className="absolute left-0 flex flex-row items-center gap-2">
                    <ArrowLeft size={24} color="#FFF" weight="bold" />
                </TouchableOpacity>
                <Text style={{ maxWidth: '80%' }} numberOfLines={1} ellipsizeMode="middle"
                    className="text-white text-lg font-medium">Documents</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}
                contentContainerClassName="flex flex-col"
                contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 100, gap: 24, backgroundColor: '#1B1B1E' }}>

                <View className="w-full flex flex-col" style={{ gap: 12 }}>
                    <Text style={{ color: '#9F9FA0' }} className="text-sm uppercase">Import</Text>
                    <TouchableOpacity
                        style={{ backgroundColor: '#27282A', padding: 14, gap: 20 }}
                        className="w-full flex flex-row items-center rounded-lg"
                        onPress={handleImportPress}
                    >
                        <View className="flex flex-row gap-2 items-center">
                            <FolderOpen size={18} color="#6CE9A6" />
                            <Text className="text-white text-lg">Import Files</Text>
                        </View>
                        <View className="flex flex-1 flex-row gap-2 items-center justify-between">
                            <Text style={{ color: '#9F9FA0' }} className="text-lg flex-1 text-right">
                                Select files or folder
                            </Text>
                        </View>
                    </TouchableOpacity>
                    <Text style={{ color: '#9F9FA0' }} className="text-xs">
                        Import documents, audio, or folders. Supports PDF, DOCX, PPTX, XLSX, audio, images, and 100+ formats via Xberg.
                    </Text>
                </View>

                <View className="w-full flex flex-col" style={{ gap: 12 }}>
                    <Text style={{ color: '#9F9FA0' }} className="text-sm uppercase">Supported Formats</Text>
                    <View style={{ backgroundColor: '#27282A', padding: 14 }} className="rounded-lg">
                        <View className="flex flex-row flex-wrap gap-2">
                            {['PDF', 'DOCX', 'PPTX', 'XLSX', 'TXT', 'MD', 'CSV', 'JSON', 'HTML', 'MP3', 'WAV', 'M4A', 'PNG', 'JPG'].map((format) => (
                                <View key={format} style={{ backgroundColor: '#333' }} className="px-2 py-1 rounded">
                                    <Text style={{ color: '#9F9FA0' }} className="text-xs">{format}</Text>
                                </View>
                            ))}
                            <View style={{ backgroundColor: '#333' }} className="px-2 py-1 rounded">
                                <Text style={{ color: '#9F9FA0' }} className="text-xs">+90 more</Text>
                            </View>
                        </View>
                    </View>
                    <Text style={{ color: '#9F9FA0' }} className="text-xs">
                        Xberg processes 100+ file formats on-device. Audio files are transcribed with Whisper. Images are OCR'd with Tesseract.
                    </Text>
                </View>

                <View className="w-full flex flex-col" style={{ gap: 12 }}>
                    <Text style={{ color: '#9F9FA0' }} className="text-sm uppercase">Processing Engine</Text>
                    <View style={{ backgroundColor: '#27282A', padding: 14, gap: 12 }} className="rounded-lg">
                        <View className="flex flex-row justify-between">
                            <Text style={{ color: '#9F9FA0' }}>Engine</Text>
                            <Text className="text-white">Xberg v1.0.8</Text>
                        </View>
                        <View className="flex flex-row justify-between">
                            <Text style={{ color: '#9F9FA0' }}>OCR</Text>
                            <Text className="text-white">Tesseract</Text>
                        </View>
                        <View className="flex flex-row justify-between">
                            <Text style={{ color: '#9F9FA0' }}>Chunking</Text>
                            <Text className="text-white">Semantic</Text>
                        </View>
                        <View className="flex flex-row justify-between">
                            <Text style={{ color: '#9F9FA0' }}>Max File Size</Text>
                            <Text className="text-white">50 MB</Text>
                        </View>
                    </View>
                </View>

                <View className="w-full flex flex-col" style={{ gap: 12 }}>
                    <TouchableOpacity
                        onPress={handleClearAll}
                        style={{ backgroundColor: 'rgba(122,39,26,0.2)' }}
                        className="flex flex-row items-center justify-center rounded-lg p-4 mb-4"
                    >
                        <Text style={{ color: '#F97066' }} className="text-lg font-medium">Clear All Documents</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeView>
    );
}
