Some problems pointed by bot reviewer: 
1. Non-degeneracy predicate in coverage_filtering.py. Codepde, spider2, and near-saturated columns get
through the current filter because it only looks at observation count / missingness. A benchmark with
std ≈ 0 carries no signal no matter how complete it is. Add a parameterized variance/non-modal       
predicate, not a hardcoded exclusion list.                
2. HaborMix scorer is structurally circular. The "reward moderate difficulty" term will always exclude
frontier and saturated items, forever, regardless of how much data arrives. Replace it with a        
discrimination term (cross-system variance) or stratify the per-benchmark cap across difficulty tiers.
This is an algorithmic choice, not a sample-size artifact.                                           
3. Representativeness metric confounds "typical" with "useful". Correlation-with-aggregate-only means
an internally redundant benchmark (240 similar tasks) will always produce top-scoring representatives 
that don't discriminate systems. Multiply by task variance, or reformulate as "task that best predicts
the benchmark aggregate via leave-one-out regression." Independent of n.                             
4. Study 8 alignment is computed but not used. If it's intended to stay informational, fine — but make
that a documented choice. If it's supposed to gate downstream task analyses, wire it through as a    
parameterized threshold. Right now it sits in a table and that's it.


A. Disentangling "Agent+Model" in Leaderboards                                                        
You explicitly requested: "Treat agent and model as separate dimensions... I don't recommend treating 
them together."                                                                                       
Currently, Study 3 (Leaderboards) still evaluates "Agent+Model" pairs (e.g., gemini-cli +             
gemini-3.1-pro-preview).                                                                              
* Fix: We need to add Marginal Leaderboards. We should have one leaderboard evaluating purely the    
    average Agent performance (controlling for models they were tested on), and another for pure Model 
    performance.                                                                                       
                                                                                                    
B. Axis Labels & "Normalized Scores"                                                                  
You noted: "normalized scores are not very clear to me".                                              
The pipeline scales the data to z-scores for imputation and regressions. However, plotting a graph    
with a "Normalized Score" axis is completely uninterpretable to a reader.                             
* Fix: All final visualizations should either explicitly state they are "Percentile Ranks",          
    "Z-Scores (Standard Deviations from Mean)", or ideally, they should be inverse-transformed back to 
    the original benchmark metrics (e.g., 0-100% accuracy) for plotting.                               
                                                                                                    
C. Defining "Difficulty" in Figures                                                                   
The pipeline defines difficulty tiers textually in the markdown (frontier <5%, hard 5-30%, medium     
30-70%, easy 70-95%, saturated >95%), but this needs to be on the plots.                              
* Fix: The plotting scripts in src/habor_mix_analyzer/visualization/ must be updated to include      
    these threshold definitions in the plot subtitles or legends.                                      
                                                                                                    
D. Task-to-Benchmark Alignment Check                                                                 
Study 8 shows that for some benchmarks (like swesmith), the aggregate task scores only correlate with
the overall benchmark score at ~0.71. This implies that simply averaging task scores doesn't         
perfectly recreate the benchmark's own grading logic.                                                
* Fix: We must add a warning flag in the pipeline to exclude benchmarks with low task-alignment (<  
    0.80) from task-level HaborMix selection, as the tasks don't accurately represent the benchmark's 
    final metric.                                                                                     
                                                                                                    
Summary Plan for the Other Agent:                                                                    
If you are passing instructions back to the other agent, tell them:                                  
1. Great job on the modular structure and covering the 7 core questions.                            
2. Task Imputation: 65% missingness is too high for SVD. Implement a strict minimum-coverage filter 
    for tasks before imputation.                                                                     
3. Leaderboards: Generate separate, marginal leaderboards for purely Agents and purely Models. Stop
    relying solely on Agent+Model pairs.                                                             
4. Clarity: Update all plotting scripts to remove the vague term "Normalized". Use "Z-Score" or     
    "Percentile", and add the mathematical definitions of "Difficulty Tiers" directly into the       
    legends of the figures.  


---

