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

