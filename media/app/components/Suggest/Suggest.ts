import fuzzysort from 'fuzzysort';
import { defineComponent, PropType } from 'vue';

export default defineComponent({
	name: 'Suggest',
	props: {
		value: {
			type: String,
			required: true,
			default: '',
		},
		suggestItems: {
			type: Array as PropType<string[]>,
			required: true,
			default: [],
		},
		autoshow: {
			type: Boolean,
			required: true,
			default: true,
		},
	},
	data: () => ({
		filteredSuggestItems: [] as string[],
		activeIndex: 0,
		suggestItemsVisible: false,
	}),
	emits: [
		'input',
		'keydownDown',
		'keydownUp',
	],
	methods: {
		hide() {
			this.suggestItemsVisible = false;
		},
		show() {
			this.suggestItemsVisible = true;
		},
		focus() {
			(this.$refs.input as HTMLInputElement)?.focus();
		},
		onInput(e: InputEvent) {
			const value: string | undefined = (e.target as HTMLInputElement)?.value;
			this.$emit('input', value);
			if (!value) {
				this.filteredSuggestItems = this.suggestItems;
				this.activeIndex = 0;
				this.hide();
				return;
			}
			this.filteredSuggestItems = fuzzysort.go(value, this.suggestItems).map(item => item.target);
			if (this.autoshow) {
				this.show();
			}
		},
		acceptActiveSuggest(e?: KeyboardEvent) {
			if (this.suggestItemsVisible) {
				this.$emit('input', this.filteredSuggestItems[this.activeIndex]);
				e?.preventDefault();
				this.hide();
				this.focus();
			}
		},
		onKeydownDown(e: KeyboardEvent) {
			if (this.suggestItemsVisible) {
				const nextItemIndex = this.activeIndex + 1;
				if (this.filteredSuggestItems[nextItemIndex]) {
					this.selectItemAtIndex(nextItemIndex);
				} else {
					this.selectItemAtIndex(0);
				}
				e.preventDefault();
			} else {
				this.$emit('keydownDown');
			}
		},
		onKeydownUp(e: KeyboardEvent) {
			if (this.suggestItemsVisible) {
				const prevItemIndex = this.activeIndex - 1;
				if (this.filteredSuggestItems[prevItemIndex]) {
					this.selectItemAtIndex(prevItemIndex);
				} else {
					this.selectItemAtIndex(this.filteredSuggestItems.length - 1);
				}
				e.preventDefault();
			} else {
				this.$emit('keydownUp');
			}
		},
		selectItemAtIndex(index: number) {
			this.activeIndex = index;
			this.scrollIntoView(index);
		},
		scrollIntoView(index: number) {
			// @ts-ignore https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoViewIfNeeded
			document.getElementById(`index${index}`)?.scrollIntoViewIfNeeded(false);
		},
		fuzzyHighlight(suggestItem: string) {
			if (!this.value) {
				return suggestItem;
			}
			// @ts-ignore
			return fuzzysort.highlight(fuzzysort.single(this.value, suggestItem), '<mark class="suggest__highlight">', '</mark>');
		},
	},
	created() {
		this.filteredSuggestItems = this.suggestItems;
	},
	mounted() {
		this.focus();
	},
});

