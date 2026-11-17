/* Slop Compare: the sample pair (Try it with a sample): two versions of a short meeting note, as text files, so the sample
 * goes through the intake like a real drop and shows changed lines, changed words, an added and a removed line. */
const A = `# Launch checklist

Owner: Priya
Date: 14 March

1. Book the venue for 40 people
2. Send the invitations by Friday
3. Order coffee and pastries
4. Print the name badges
5. Test the projector and the microphone

Budget: 1,200 EUR
Questions go to the team channel.
`;
const B = `# Launch checklist

Owner: Priya and Sam
Date: 21 March

1. Book the venue for 60 people
2. Send the invitations by Wednesday
3. Order coffee, tea and pastries
5. Test the projector and the microphone
6. Record the talk for the newsletter

Budget: 1,500 EUR
Questions go to the team channel.
`;

export const sample = () => [new File([A], 'checklist-v1.md', { type: 'text/markdown' }), new File([B], 'checklist-v2.md', { type: 'text/markdown' })];
