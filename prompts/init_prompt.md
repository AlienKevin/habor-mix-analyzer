## Init exploration

I am working on a large-scale agent eval projects to evaluate various agents and models across a wide range of benchmarks. I would like to have some cross-benchmark analysis to reveal intersting insights. The brainstorming ideas can accessed form brainstorm/ , where you should check, read, and understand carefully. If you have other ideas, feel free to propose them in addition.

The available data can be accessed from data/ . Note that currently we only have the raw data, which is imcomplete (we are still running experiments to try to complete the tables). However, a lot of them are filled, which should be sufficient for us to build the analysis pipeline first - then we can easily apply the analysis after the full data becomes available. So what we are trying to do now is to build the analysis pipeline according to the currently available data.

Now I would like you to first explore the raw data we had and understand the data structures. Then we should apply some data approaches to fill in the missing values reasonablly (e.g., via SVD?). Save the processed data files with reasonable naming under data/processed/ to build our data analysis pipeline.

Play around with the data. Keep the output savings clean (i.e., clean up outdated files periodically). When you deliver to me, tell me:
1. What analysis you have done, and their corresponding files; what you haven't done and how you plan to do them
2. Where are the results located and how to interpret them
3. What are your observations and analysis insights
4. What should we and can we do further for the analysis
5. Other things that you would like to note

Env and codebase requirement:
1. Use uv to manage env and dependencies.
2. Write and save files in a structured way. The root should be very clean
3. Update README and Agents.md each time you have some updates.
4. Git commit when you achieve enough progress.
5. For visualization, use large fonts, compact layout, dilute/light colors, and reasonable structure to make it eye-friendly.

---

Okay you seem to generate so a lot of data files and results, but it makes me hard to track and see what's important. I checked the visualization results, and they seem to be not very insight-oriented. I bet you haven't completed enough studies to tell the insights and story.

You should primarily finish all the studies that you believe are necessary. Then the codebase should be organized in a way that clearly distinguishes the important and intermediate analysis results (i.e., make separate directories for the important tables and figures and analysis result texts that we can directly refer to - filter them if you feel like they should be put into the paper).

Feel free to discard datasets where few data points are avaiable.

Regarding analysis, some comments from my side:
1. Categorize by benchmark-level and task-level: they should reveal different things and apply different analysis methods.
2. Treat agent and model as separate dimensions. It's okay to sometimes treat them together as what you named a "system", but I don't recommend that - or the name should be just `agent+model` instead of system
3. For all the analysis, you should clearly state
    - **Method**: What kind of analysis approach did you take; briefly explain the algo behind it, what it is trying to do, and why we need it as part of our study
    - **Code files**: file paths
    - **Result paths**: file paths that point to csv, img, md, etc.
    - **Result overview and analysis**: natural language section where you show your analysis thinking process
    - **Insight and findings**: useful take-aways for paper writing
    and there should be a section the tells the story based on the analysis, as some analysis, when viewed together, can reveal more things.


Go ahead to refine and complete everything before termination.

---

Okay seems better. Here are some comments:
1. Feel free to remove no-longer useful files. This make the directory cleaner
2. For all important findings, make sure you have visualization if achievable
3. For all figures, the axis names should be crystal clear: normalized scores are not very clear to me
4. For the md files, I think it's a good practice to show the generated output figures and/or tables in the text so that reading it doesn't require frequent file and context switch - that md file should be a single file for us to look at and learn what happened. It can be long and in detail - don't sacrifice quality.
5. I'd be still very interested in the following research questions (maybe you have covered them, but I am just pointing out in case you miss any of those):
    - `agent` and `model`: which plays a more significant role? Overall vs. per benchmark? Would this relationship vary across benchmarks?
    - BenchPress tells us that benchmark scores are predictable for a lot of benchmarks. How does this apply to our scenario? Which benchmarks are hard to predict? What tasks are hard to predict? How do you know? Can you rank them quantitively?
    - How similar are benchmarks to each other? How similar are tasks within a benchmark similar to each other? How similar are tasks across benchmarks? Maybe we can have some good clustering techniques and visualization to demontrate these?
    - What tasks best represent a benchmark? In terms of scores, difficulty, etc.?
    - We should be able to get mini-leaderboards for each benchmark, and then plot agent-model performances accordingly. We can place this leaderboard graph in groups to generate several figures, each consist of several similar benchmarks (similar in domains? agent model scores? you decide)
    - Terminus is the fair comparison across all models - how does each agent harness "improves" over terminus?
    - How did we select harbor-mix? Is there some quantitative measurements that we can use and visualize to help select?
