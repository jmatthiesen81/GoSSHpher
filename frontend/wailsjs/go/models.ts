export namespace i18n {
	
	export class Language {
	    code: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new Language(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.code = source["code"];
	        this.name = source["name"];
	    }
	}

}

export namespace main {
	
	export class BackupSettings {
	    enabled: boolean;
	    keep: number;
	
	    static createFrom(source: any = {}) {
	        return new BackupSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.enabled = source["enabled"];
	        this.keep = source["keep"];
	    }
	}
	export class ExecResult {
	    command: string;
	    success: boolean;
	    exitCode: number;
	    output?: string;
	    timedOut?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ExecResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.command = source["command"];
	        this.success = source["success"];
	        this.exitCode = source["exitCode"];
	        this.output = source["output"];
	        this.timedOut = source["timedOut"];
	    }
	}
	export class UISettings {
	    sort?: string;
	    collapsed?: string[];
	    widths?: Record<string, number>;
	    dismissedUpdate?: string;
	
	    static createFrom(source: any = {}) {
	        return new UISettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sort = source["sort"];
	        this.collapsed = source["collapsed"];
	        this.widths = source["widths"];
	        this.dismissedUpdate = source["dismissedUpdate"];
	    }
	}
	export class Settings {
	    language: string;
	    backup: BackupSettings;
	    terminal?: string;
	    updateCheck: boolean;
	    ui: UISettings;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.language = source["language"];
	        this.backup = this.convertValues(source["backup"], BackupSettings);
	        this.terminal = source["terminal"];
	        this.updateCheck = source["updateCheck"];
	        this.ui = this.convertValues(source["ui"], UISettings);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SettingsInfo {
	    settings: Settings;
	    path: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new SettingsInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.settings = this.convertValues(source["settings"], Settings);
	        this.path = source["path"];
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class State {
	    path: string;
	    exists: boolean;
	    config?: sshconfig.Config;
	    text: string;
	    dirty: boolean;
	    issues: sshconfig.Issue[];
	    hostnames: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new State(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.exists = source["exists"];
	        this.config = this.convertValues(source["config"], sshconfig.Config);
	        this.text = source["text"];
	        this.dirty = source["dirty"];
	        this.issues = this.convertValues(source["issues"], sshconfig.Issue);
	        this.hostnames = source["hostnames"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TemplateHost {
	    patterns: string;
	    options: TemplateOption[];
	
	    static createFrom(source: any = {}) {
	        return new TemplateHost(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.patterns = source["patterns"];
	        this.options = this.convertValues(source["options"], TemplateOption);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TemplateOption {
	    key: string;
	    value: string;
	
	    static createFrom(source: any = {}) {
	        return new TemplateOption(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.value = source["value"];
	    }
	}
	export class Template {
	    name: string;
	    kind: string;
	    options?: TemplateOption[];
	    group?: string;
	    hosts?: TemplateHost[];
	
	    static createFrom(source: any = {}) {
	        return new Template(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.kind = source["kind"];
	        this.options = this.convertValues(source["options"], TemplateOption);
	        this.group = source["group"];
	        this.hosts = this.convertValues(source["hosts"], TemplateHost);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class TemplatesInfo {
	    templates: Template[];
	    path: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new TemplatesInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.templates = this.convertValues(source["templates"], Template);
	        this.path = source["path"];
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class UpdateInfo {
	    current: string;
	    latest?: string;
	    url?: string;
	    available: boolean;
	
	    static createFrom(source: any = {}) {
	        return new UpdateInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.current = source["current"];
	        this.latest = source["latest"];
	        this.url = source["url"];
	        this.available = source["available"];
	    }
	}

}

export namespace sshconfig {
	
	export class Entry {
	    type: string;
	    key?: string;
	    value?: string;
	    text?: string;
	    raw?: string;
	
	    static createFrom(source: any = {}) {
	        return new Entry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.key = source["key"];
	        this.value = source["value"];
	        this.text = source["text"];
	        this.raw = source["raw"];
	    }
	}
	export class Block {
	    id: string;
	    kind: string;
	    keyword?: string;
	    patterns?: string;
	    headerRaw?: string;
	    leading: Entry[];
	    entries: Entry[];
	    group?: string;
	    groupStartRaw?: string;
	    groupStartPos?: number;
	    groupEndRaw?: string;
	    groupEndTrail?: number;
	
	    static createFrom(source: any = {}) {
	        return new Block(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.kind = source["kind"];
	        this.keyword = source["keyword"];
	        this.patterns = source["patterns"];
	        this.headerRaw = source["headerRaw"];
	        this.leading = this.convertValues(source["leading"], Entry);
	        this.entries = this.convertValues(source["entries"], Entry);
	        this.group = source["group"];
	        this.groupStartRaw = source["groupStartRaw"];
	        this.groupStartPos = source["groupStartPos"];
	        this.groupEndRaw = source["groupEndRaw"];
	        this.groupEndTrail = source["groupEndTrail"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Note {
	    code: string;
	    params?: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new Note(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.code = source["code"];
	        this.params = source["params"];
	    }
	}
	export class ExecCheck {
	    command: string;
	    expanded: string;
	    negated: boolean;
	    result: boolean;
	    assumed: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ExecCheck(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.command = source["command"];
	        this.expanded = source["expanded"];
	        this.negated = source["negated"];
	        this.result = source["result"];
	        this.assumed = source["assumed"];
	    }
	}
	export class BlockResult {
	    blockId: string;
	    blockIndex: number;
	    label: string;
	    file?: string;
	    matched: boolean;
	    execs?: ExecCheck[];
	    notes?: Note[];
	
	    static createFrom(source: any = {}) {
	        return new BlockResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.blockId = source["blockId"];
	        this.blockIndex = source["blockIndex"];
	        this.label = source["label"];
	        this.file = source["file"];
	        this.matched = source["matched"];
	        this.execs = this.convertValues(source["execs"], ExecCheck);
	        this.notes = this.convertValues(source["notes"], Note);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Config {
	    blocks: Block[];
	    newline: string;
	    finalNewline: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.blocks = this.convertValues(source["blocks"], Block);
	        this.newline = source["newline"];
	        this.finalNewline = source["finalNewline"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class EffectChange {
	    host: string;
	    key: string;
	    before: string;
	    after: string;
	
	    static createFrom(source: any = {}) {
	        return new EffectChange(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.host = source["host"];
	        this.key = source["key"];
	        this.before = source["before"];
	        this.after = source["after"];
	    }
	}
	
	
	export class Source {
	    blockId: string;
	    blockIndex: number;
	    label: string;
	    file?: string;
	
	    static createFrom(source: any = {}) {
	        return new Source(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.blockId = source["blockId"];
	        this.blockIndex = source["blockIndex"];
	        this.label = source["label"];
	        this.file = source["file"];
	    }
	}
	export class IgnoredValue {
	    value: string;
	    source: Source;
	
	    static createFrom(source: any = {}) {
	        return new IgnoredValue(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.value = source["value"];
	        this.source = this.convertValues(source["source"], Source);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Issue {
	    severity: string;
	    blockId: string;
	    entry: number;
	    code: string;
	    params?: Record<string, string>;
	    items?: any[];
	
	    static createFrom(source: any = {}) {
	        return new Issue(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.severity = source["severity"];
	        this.blockId = source["blockId"];
	        this.entry = source["entry"];
	        this.code = source["code"];
	        this.params = source["params"];
	        this.items = source["items"];
	    }
	}
	export class Keyword {
	    name: string;
	    multi?: boolean;
	    values?: string[];
	
	    static createFrom(source: any = {}) {
	        return new Keyword(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.multi = source["multi"];
	        this.values = source["values"];
	    }
	}
	
	export class ResolvedOption {
	    key: string;
	    values: string[];
	    sources: Source[];
	    multi: boolean;
	    ignored?: IgnoredValue[];
	    expanded?: string[];
	
	    static createFrom(source: any = {}) {
	        return new ResolvedOption(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.values = source["values"];
	        this.sources = this.convertValues(source["sources"], Source);
	        this.multi = source["multi"];
	        this.ignored = this.convertValues(source["ignored"], IgnoredValue);
	        this.expanded = source["expanded"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Resolution {
	    host: string;
	    options: ResolvedOption[];
	    blocks: BlockResult[];
	    notes?: Note[];
	
	    static createFrom(source: any = {}) {
	        return new Resolution(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.host = source["host"];
	        this.options = this.convertValues(source["options"], ResolvedOption);
	        this.blocks = this.convertValues(source["blocks"], BlockResult);
	        this.notes = this.convertValues(source["notes"], Note);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	

}

