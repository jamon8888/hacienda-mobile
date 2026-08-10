// Type overrides for @yz1311/react-native-intent-launcher to fix TypeScript errors
// These errors are in the library's source code and we can't modify them directly

declare module "@yz1311/react-native-intent-launcher" {
  export interface Intent {
    data?: string;
    flags?: number;
    packageName?: string;
    classPackageName?: string;
    className?: string;
    action?: string;
    [key: string]: any;
  }

  export interface ResolveInfo {
    activityInfo: {
      packageName: string;
    };
  }

  export interface IntentConstant {
    FLAG_ACTIVITY_NEW_TASK: number;
    ACTION_INSERT: string;
    // Add other constants as needed
  }

  export const IntentConstant: IntentConstant;

  export default class IntentLauncher {
    static startActivity(intent: Intent): Promise<void>;
    static isIntentAvailable(intent: Intent): Promise<boolean>;
    static getAvailableResolveInfos(intent: Intent): Promise<ResolveInfo[]>;
    static startActivityForResult(intent: Intent, requestCode: number): Promise<void>;
  }

  export class AppUtils {
    static isAppSystem(packageName: string): boolean;
  }

  export class RomUtils {
    static isSamsung(): boolean;
    static isLeeco(): boolean;
  }

  export class IntentLauncherUtils {
    static isIntentAvailable(intent: Intent): Promise<boolean>;
    static getAvailableResolveInfos(intent: Intent): Promise<ResolveInfo[]>;
  }
}