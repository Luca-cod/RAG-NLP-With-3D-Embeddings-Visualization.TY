# RAG-LangChain-NaturalLanguageResponseFormat
It's a RAG-Langchain version with return a Natural Language response format


A highly structured RAG (Retrieval-Augmented Generation) pipeline built with LangChain that produces answers in a Natural-language response format.

This repository implements a multi-stage retrieval and context–formatting system using:

FAISS for similarity search

Recursive document splitting

Automatic query classification

Natural-language context construction optimized for LLMs

Overview

This version of the RAG system is the most advanced and modular implementation.
It includes multiple wrapper functions designed to process and prepare structured IoT-like installation datasets for optimal retrieval and LLM reasoning.

FAISS (by Meta) is used as the vector store, enabling high-performance similarity search over dense embeddings.

Main Features

 Global document loader

 Recursive chunk splitting with parent/child hierarchy

 Automatic query classification

 Adaptive retrieval strategy (summary/detail/area)

 Natural-language reconstruction of JSON data

 FAISS vector store with manual metadata filtering

 Highly modular and customizable architecture

 Document Loading

Function: loadDocumentJSON

This function:

Reads and validates a local JSON installation file

Builds global maps for:

areas

endpoints

statistics

enriched metadata

the global partitions map

Returns a single, unified document representing the entire installation

This creates a consistent and structured foundation for chunk generation and retrieval.

Recursive Chunk Splitting

Due to the large size of some device documents, two splitting stages are used:

1. First Split

Checks whether a document exceeds a defined maxChunkSize.
If it does, the second splitting stage is triggered.

2. Recursive Second Split

Splits oversized chunks repeatedly until every chunk falls within the optimal size required for embeddings generation.

Parent ↔ Children Linking

Recursive splitting normally causes loss of context because child chunks become disconnected from their original parent.

To solve this, a hierarchical relation is created using a sequence number system based on the device IP.

This ensures:

No information is lost

All child chunks remain linked to their parent

LLMs can reconstruct the original structure

Query Understanding — AdaptiveRecoveryWithDevices

This function analyzes the user query to classify it into a specific query type.

It uses:

Regex pattern matching

Keyword sets defined in getConfig()

Device structure definitions

Query-type rules that determine:

response format

relevant chunk types

devices to filter for

This enables the system to determine:

Whether the query is specific, generic, location-based, or automation related

Which devices are relevant

How to filter retrieval results accordingly

 Keyword definitions are static; they can be expanded or refined based on usage and testing.

 Chunk Structure Creation

Function: createChunksStructure

This function generates multiple chunk types:

summary chunks

detail chunks

area chunks

By default:

7 summary chunks

7 detail chunks

1 area chunk

Summary chunks

Light, concise, ideal for generic queries.
They reduce noise and improve model performance.

Detail chunks

Rich, heavily detailed, ideal for specific queries requiring parameter-level information.

Two-Stage Retrieval

Function: twoStageRetrieval

Uses the query type defined by AdaptiveRecoveryWithDevices to filter the allowed chunk types before executing similarity search.

Query Type	            Chunk Type Selected
Specific Query	            detail
Generic Query	            summary
Location Query	            area
Automation Query	        (planned)

Natural Language Formatting

LLMs understand natural language far better than complex JSON structures.

Because chunk content is JSON-based and highly structured, LLM reasoning suffers unless translated.

Function: formattingContext converts all chunk types into a clean, readable, structured natural-language context, enabling:

better comprehension

better retrieval alignment

significantly improved final answer quality

This step is essential for large, structured installations.

Similarity Search with FAISS

The system uses FAISS + LangChain’s asRetriever().

Why asRetriever()?

Already handles similarity search internally

Clean integration with LangChain pipelines

FAISS Limitations

FAISS supports very limited filtering, and metadata-based filters do not work as described in much of the documentation.

To solve this:

Retrieve top-K chunks via FAISS

Apply manual post-filtering (e.g., by visualizationType)

For richer filtering needs, ChromaDB is recommended.
A basic RAG version using Chroma is also implemented separately.


Documentation Caveats

Based on development experience:

Many FAISS examples reference features that aren’t implemented

Several methods are deprecated without warning

Some API functions have changed location with no updated documentation

Always test and validate library behavior directly in code.


LLM Requirements

Correctness and reliability depend heavily on the LLM used.

For best results, use models trained with billions of parameters.
The larger the model, the better the:

contextual reasoning

disambiguation

consistency

factual accuracy

This is true for both the advanced and basic RAG versions.


Future Improvements

Potential enhancements:

Dynamic keyword extraction

Embeddings-based query classification

Better hierarchical chunk reconstruction

Vector store abstraction for multi-backend support

Automation query execution (e.g., updating device parameters)

Improved metadata schemas for more precise filtering