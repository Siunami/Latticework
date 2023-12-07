/* State Fields */
export type Link = {
	text: string;
	file: string;
};

export interface DocumentLocation {
	prefix: string;
	text: string;
	suffix: string;
	filename: string;
	from: number; // document offsets
	to: number; // document offsets
}

export interface Backlink {
	referencedLocation: DocumentLocation;
	referencingLocation: DocumentLocation;
	dataString: string;
}
