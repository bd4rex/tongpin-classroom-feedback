# AI Everywhere 40 minute lesson

[中文](ai-everywhere.md)

This Grade 7 lesson adapts the supplied 52-slide PPT and 40-minute teaching script. It is bundled with Tongpin 0.4.0 and creates a complete classroom with six draft groups. The 12 Chinese-language tasks use only three interaction formats: six choice tasks (five single-choice and one multiple-choice), four fill-in tasks, and two AI question tasks.

## How to use it

1. Start the project and sign in as a teacher. Choose **New classroom → Preset activities → 人工智能 · 无处不在的人工智能**, or use its card on the home page. Finish any existing current classroom before creating another.
2. The template creates six draft groups. Open **教师讲解提示** below a task for pacing, suggested narration, reference explanations, and PPT page references.
3. Configure and test a model in **AI settings**. Choice and fill-in submissions do not call AI. Each AI task allows up to two independent requests per participant; subsequent questions must supply their own context.
4. Share the classroom code and publish each group at the appropriate point. Minutes in the titles are teaching suggestions, including explanation time, rather than automatic countdowns. Publishing another group preserves earlier open groups and the student's current input.
5. Review responses before choosing **Show this task's results**. Fill-in reference answers reach students only after this action. Teacher notes always remain teacher-only. Teachers discuss fill-in responses against the reference; open expressions are not automatically marked by exact string equality.
6. Export full-class records or the current task's CSV, save a group as a preparation pack, or use **Teach again**. Reuse retains task groups, blanks, and teacher notes without students or previous responses.

```bash
npm ci
npm run build
npm start
```

Teacher entry: `http://127.0.0.1:3210`. The source is `server/lessons/ai-everywhere.js`, included with the source checkout and the Docker image's `server/` directory. No original PPT, Word file, database seed, or separate import is required.

## Learning objectives

- Explain an everyday AI use and distinguish automatic operation from intelligent recognition.
- Use a robot dog or chess robot to explain data, algorithms, and computing power.
- Evaluate an AI suggestion, propose a verification method, and explain human responsibility.

## Lesson timing

| Time | Segment | Interactions | PPT pages |
| --- | --- | --- | --- |
| 0–5 minutes | Everyday AI | Single choice, fill-in | 2–10, 17–18 |
| 5–12 minutes | Understanding AI | Single choice, fill-in | 11–16 |
| 12–20 minutes | Data, algorithms, and computing power | Fill-in, single choice | 19–25 |
| 20–27 minutes | Social applications | Two single-choice tasks | 26–44 |
| 27–35 minutes | Questioning and improving with AI | Two AI question tasks | 46–49, 52 |
| 35–40 minutes | Responsible use and recap | Multiple choice, fill-in | 49–52 |

## Teaching content and tasks

### Everyday AI (5 minutes)

#### 1. Which function most needs recognition and inference?

Single choice. Compare an ordinary timed alarm, a switched lamp, a photo-based plant identifier, and an ordinary calculator using an entered expression. Reference: **C, plant identification**. Explain that the described ordinary devices follow fixed operations; electricity or automation alone does not establish AI use. Students need not infer a real product's internal implementation from its appearance.

Suggested opening: ask students which tools they have encountered since waking up. Students who have not used them can work from the supplied examples. Use speech assistants, entrance recognition, and recommendations as introductions, then complete this group's two tasks.

#### 2. Complete an example of AI around you

Fill-in. The material lists face recognition, voice assistants, recommendations, navigation, robot vacuums, and photo identification. The blanks ask for **an AI application** and **what it helps people do**. Accept a matching pair, such as a voice assistant and converting speech to text. Discuss two representative responses. Do not make device ownership a prerequisite, or equate every route calculation with AI.

### Understanding AI (7 minutes)

#### 3. Which understanding of AI is more appropriate?

Single choice. Reference: **B, machines simulate and extend some human intellectual abilities**. Reject the claims that all automatic equipment is AI, fluent responses establish human feelings or consciousness, or people no longer need to learn and judge. Explain the abbreviation Artificial Intelligence and its relation to recognition, language processing, and inference. Seeing, hearing, speaking, and thinking are teaching analogies rather than a complete classification rule. Historical examples may be mentioned without adding a date-recall task.

#### 4. What do the voice assistant's hearing and speaking stages do?

Fill-in. A student asks the assistant to set a reminder and hears its confirmation. Choose between speech recognition and speech synthesis. References: **speech recognition** converts a person's voice into text; **speech synthesis** converts the response text into sound. Explain that interpreting and carrying out the request is a separate intermediate step. Domestic voice applications can illustrate this without unsupported rankings or accuracy figures.

### Data, algorithms, and computing power (8 minutes)

#### 5. What supports a robot dog recognizing a person?

Fill-in. Engineers provide annotated photographs, use a recognition method, and run computations on chips. References: **data** for the annotated photographs, **algorithms** for the learning and recognition method, and **computing power** for computational capability. Extend the analogy to chess records, decision methods, and computing capacity. Training a dog is an analogy and does not establish that every AI system learns through rewards. Specific chip specifications and detector internals are not assessed.

Suggested transition: a robot dog moves, but so does a fan. Ask what information the robot recognizes and what decisions it makes, then introduce the foundations of those abilities.

#### 6. How should a robot dog that struggles in rain be improved?

Single choice. The system mostly encountered sunny, frontal training photographs; umbrellas, raincoats, and obscured views now cause unstable recognition. Reference: **A, add appropriate annotated samples and evaluate improvements on new samples**. More repetition of one sunny photograph, a larger casing, or unchecked trust does not address the described problem. Discuss coverage and annotation quality. More varied data still cannot guarantee perfect results.

### Social applications (7 minutes)

#### 7. Which farmland warning process is more reasonable?

Single choice. Farmers cannot continuously watch a large field. Reference: **B, collect information, analyze and flag abnormalities, then let people decide using the actual conditions**. A camera alone is not sufficient, and an alert should not remove human review. Discuss risk detection and reduced continuous observation without promising harvest outcomes or prescribing agricultural treatments.

#### 8. Which applications and purposes match?

Single choice. Reference: **D, ports can use assistance with scheduling, manufacturing with inspection, and the arts with creative work**. Correct the distractors that confuse voice and port operations, guarantee product quality from a robot's appearance, or remove human creativity and judgment. Use domestic applications from the supplied materials while avoiding unverified record, speed, and performance figures. People still define goals, choose creative directions, supervise systems, and take responsibility.

### Questioning and improving with AI (8 minutes)

#### 9. Ask AI to explain a recognition error

AI question task, approximately four minutes, up to two independent requests. Choose a plant-identification tool confusing a strawberry with a small tomato, or a speech assistant confusing fourteen with forty. Ask for a Grade 7 explanation using data or algorithms, one improvement, and a way to verify it. Students then write **one possible explanation** and **something still requiring verification**.

The task's model instruction distinguishes possible causes from established diagnoses, limits answer length, and asks a verification question instead of writing the student's reflection. Students should supply context again if they ask another question.

#### 10. Improve a future school idea with AI

AI question task, approximately four minutes, up to two independent requests. Choose school water conservation, plant observation, or library borrowing. Identify a concrete problem, then ask what information could help, what AI could assist with, what people should decide, and what might go wrong. Students summarize **their problem**, **an adopted or revised suggestion**, and **a decision retained by people**. Use hypothetical details without real names, addresses, or contact information.

The model instruction frames ideas as proposals, avoids guarantees of deployment or effectiveness, and encourages the student to improve the proposal. This adapts the source's drawing activity into a text interaction inside the project.

### Responsible use and recap (5 minutes)

#### 11. Which practices should be retained when using AI?

Multiple choice. References: **A, verify important information; C, think independently before using explanations; E, retain human review and responsibility**. Reject sharing classmates' names, addresses and phone numbers, and copying fluent answers without checking. All three reference options must be selected to match the reference exactly.

#### 12. Summarize the lesson in two blanks

Fill-in. Complete **AI can help me …, but I still need to …** with concrete, related actions. For example, identify an unfamiliar plant and verify the identification, or suggest a water-saving idea and check its suitability. Accept different expressions. Ask for specificity if students only write generic slogans. Conclude with an optional observation of an everyday application; no fourth interaction format is introduced.

## Adaptations

The script informs the everyday opening, robot-dog questions, foundations analogy, discussion of application value, and responsible-use conclusion. Representative everyday examples replace an exhaustive spoken tour. Domestic applications are integrated into the voice and industry segments to reserve eight minutes for actual AI questions.

Image creation becomes text-based AI questioning. A physical robot dog, videos, raised hands, photography, and image annotation are not platform tasks or completion requirements. Students receive the necessary scenarios in the task descriptions; teachers can still present the original deck alongside the project.

The adaptation clarifies that automation alone is not AI, anthropomorphic expressions and dog training are analogies, important AI answers need checking, and more varied data cannot guarantee correctness. The duplicated port labels on PPT page 36 are not reused. Unverified robot records, chip counts, performance figures, and rankings are excluded from assessment.

## Preparation and fallback

Try both AI tasks in a test classroom before teaching and check that the configured model can answer at the intended level. If the model is unavailable, choice and fill-in submissions still work. A teacher can supply possible explanations or questions orally and have students use the same AI task's reflection box. Such content must not be represented as a real AI response.

The 40-minute plan is proposed teaching time, not evidence of a real full-length lesson or school-network capacity test. See [TEST_REPORT.en.md](../../TEST_REPORT.en.md) for verification scope.

## Sources and maintenance

- PPT: `无处不在的人工智能V4.pptx`, 52 slides, attributed in the supplied deck to 包桂霞, 南京市科利华中学.
- PPT SHA-256: `83d9016639296dc8de1a13e3946dda5c6d28dbbd7a6f494774aea0eb6c125f01`.
- Script: `无处不在的人工智能_40分钟课堂逐字稿..docx`.
- Script SHA-256: `48ff7b07c20f00fa92f64ee644371d419d7f22418a3939caa8c1ee3ac1699b03`.
- Both originals were read as source material; neither was modified or copied into the release package.
- Lesson implementation: [`server/lessons/ai-everywhere.js`](../../server/lessons/ai-everywhere.js). After changes, run `npm run lesson:guide` to regenerate the Chinese guide and update this English companion.
- The [form integration contract](../form-integration.en.md) documents blanks and teacher notes. Classrooms and preparation packs containing fill-in tasks require 0.4.0 or later. Switching to the original layout does not switch to older application code.
